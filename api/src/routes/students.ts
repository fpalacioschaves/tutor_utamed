import { Router } from "express";
import { prisma } from "../lib/prisma";

export const studentsRouter = Router();

studentsRouter.get("/", async (req, res, next) => {
  try {
    const search = typeof req.query.search === "string" ? req.query.search.trim() : "";
    const students = await prisma.alumno.findMany({
      where: search
        ? {
            OR: [
              { nombre: { contains: search } },
              { apellidos: { contains: search } },
              { email: { contains: search } },
            ],
          }
        : undefined,
      orderBy: [{ apellidos: "asc" }, { nombre: "asc" }],
      include: {
        matriculas: {
          where: { activa: true },
          include: { asignatura: true },
        },
      },
    });
    res.json(students);
  } catch (error) {
    next(error);
  }
});


studentsRouter.get("/:id/detail", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Identificador de alumno no válido" });
      return;
    }

    const student = await prisma.alumno.findUnique({
      where: { id },
      include: {
        matriculas: {
          include: {
            asignatura: { include: { cursoAcademico: true } },
          },
          orderBy: { fechaAlta: "desc" },
        },
      },
    });

    if (!student) {
      res.status(404).json({ error: "Alumno no encontrado" });
      return;
    }

    const activeSubjectIds = student.matriculas
      .filter((enrollment) => enrollment.activa)
      .map((enrollment) => enrollment.asignaturaId);

    const [records, activities, deliveries, tutorials, followUps, incidents, communications] = await Promise.all([
      prisma.registroSesion.findMany({
        where: { alumnoId: id },
        include: {
          sesion: {
            include: { asignatura: true, unidad: true },
          },
        },
        orderBy: { sesion: { inicio: "desc" } },
      }),
      activeSubjectIds.length
        ? prisma.actividad.findMany({
            where: { asignaturaId: { in: activeSubjectIds }, activa: true },
            include: { asignatura: true, unidad: true },
            orderBy: [{ fechaLimite: "desc" }, { createdAt: "desc" }],
          })
        : Promise.resolve([]),
      prisma.entrega.findMany({
        where: { alumnoId: id },
        include: { actividad: { include: { asignatura: true, unidad: true } } },
      }),
      prisma.tutoriaIndividual.findMany({
        where: { alumnoId: id },
        include: { asignatura: true },
        orderBy: [{ inicio: "desc" }, { fechaSolicitud: "desc" }],
      }),
      prisma.seguimiento.findMany({
        where: { alumnoId: id },
        include: { asignatura: true, sesion: true, actividad: true, incidencia: true },
        orderBy: { fechaObjetivo: "desc" },
      }),
      prisma.incidencia.findMany({
        where: { alumnoId: id },
        include: { asignatura: true, sesion: true },
        orderBy: { fecha: "desc" },
      }),
      prisma.comunicacion.findMany({
        where: { alumnoId: id },
        include: { asignatura: true },
        orderBy: { fecha: "desc" },
      }),
    ]);

    const deliveryByActivity = new Map(deliveries.map((delivery) => [delivery.actividadId, delivery]));
    const activityById = new Map<number, (typeof activities)[number]>();
    for (const activity of activities) activityById.set(activity.id, activity);
    // Conserva en la ficha cualquier actividad que tenga evidencia histórica
    // del alumno, aunque ya no siga matriculado actualmente en esa asignatura.
    for (const delivery of deliveries) {
      if (!activityById.has(delivery.actividadId)) {
        activityById.set(delivery.actividadId, delivery.actividad);
      }
    }
    const activityRows = Array.from(activityById.values())
      .map((activity) => ({
        ...activity,
        entrega: deliveryByActivity.get(activity.id) ?? null,
      }))
      .sort((a, b) => {
        const aDate = (a.fechaLimite ?? a.createdAt).getTime();
        const bDate = (b.fechaLimite ?? b.createdAt).getTime();
        return bDate - aDate;
      });

    const attendanceStates = [
      "PRESENTE",
      "AUSENTE",
      "RETRASO",
      "SALIDA_ANTICIPADA",
      "AUSENCIA_JUSTIFICADA",
    ] as const;

    function summarizeAttendance(rows: typeof records) {
      const counts = Object.fromEntries(attendanceStates.map((state) => [state, 0])) as Record<(typeof attendanceStates)[number], number>;
      let registered = 0;
      for (const row of rows) {
        if (!row.estadoAsistencia) continue;
        registered += 1;
        counts[row.estadoAsistencia] += 1;
      }
      const porcentajes = Object.fromEntries(
        attendanceStates.map((state) => [
          state,
          registered ? Math.round((counts[state] / registered) * 1000) / 10 : null,
        ]),
      ) as Record<(typeof attendanceStates)[number], number | null>;
      return {
        registrados: registered,
        ...counts,
        porcentajes,
      };
    }

    const attendanceBySubject = student.matriculas
      .map((enrollment) => {
        const subjectRecords = records.filter((record) => record.sesion.asignaturaId === enrollment.asignaturaId);
        return {
          asignatura: enrollment.asignatura,
          matriculaActiva: enrollment.activa,
          resumen: summarizeAttendance(subjectRecords),
        };
      });

    const timeline = [
      ...records.map((record) => ({
        id: `sesion-${record.id}`,
        fecha: record.sesion.inicio,
        tipo: "SESION",
        asignatura: record.sesion.asignatura?.nombre ?? null,
        titulo: record.sesion.tipo === "TUTORIA_GRUPAL" ? "Tutoría grupal" : "Clase",
        detalle: record.observacion,
        estado: record.estadoAsistencia,
      })),
      ...deliveries.map((delivery) => ({
        id: `entrega-${delivery.id}`,
        fecha: delivery.fechaEntrega ?? delivery.updatedAt,
        tipo: "ACTIVIDAD",
        asignatura: delivery.actividad.asignatura.nombre,
        titulo: delivery.actividad.titulo,
        detalle: delivery.observacion,
        estado: delivery.estado,
        calificacion: delivery.calificacion,
      })),
      ...tutorials.map((tutorial) => ({
        id: `tutoria-${tutorial.id}`,
        fecha: tutorial.inicio ?? tutorial.fechaSolicitud,
        tipo: "TUTORIA_INDIVIDUAL",
        asignatura: tutorial.asignatura?.nombre ?? null,
        titulo: tutorial.motivo || "Tutoría individual",
        detalle: tutorial.observaciones || tutorial.acuerdos,
        estado: tutorial.estado,
      })),
      ...followUps.map((followUp) => ({
        id: `seguimiento-${followUp.id}`,
        fecha: followUp.fechaObjetivo,
        tipo: "SEGUIMIENTO",
        asignatura: followUp.asignatura?.nombre ?? null,
        titulo: followUp.descripcion,
        detalle: null,
        estado: followUp.estado,
      })),
      ...incidents.map((incident) => ({
        id: `incidencia-${incident.id}`,
        fecha: incident.fecha,
        tipo: "INCIDENCIA",
        asignatura: incident.asignatura?.nombre ?? null,
        titulo: incident.titulo,
        detalle: incident.descripcion,
        estado: incident.estado,
      })),
      ...communications.map((communication) => ({
        id: `comunicacion-${communication.id}`,
        fecha: communication.fecha,
        tipo: "COMUNICACION",
        asignatura: communication.asignatura?.nombre ?? null,
        titulo: communication.motivo || communication.canal,
        detalle: communication.resumen,
        estado: communication.canal,
      })),
    ].sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime());

    res.json({
      alumno: student,
      asistencia: {
        global: summarizeAttendance(records),
        porAsignatura: attendanceBySubject,
        registros: records,
      },
      actividades: activityRows,
      tutorias: tutorials,
      seguimientos: followUps,
      incidencias: incidents,
      comunicaciones: communications,
      cronologia: timeline,
    });
  } catch (error) {
    next(error);
  }
});

studentsRouter.post("/", async (req, res, next) => {
  try {
    const { nombre, apellidos, email, identificadorExterno, notasGenerales, asignaturaIds, activo } = req.body;
    if (!nombre || !apellidos) {
      res.status(400).json({ error: "nombre y apellidos son obligatorios" });
      return;
    }

    const selectedSubjectIds = Array.isArray(asignaturaIds)
      ? Array.from(new Set(asignaturaIds.map(Number).filter(Number.isInteger)))
      : [];

    const student = await prisma.$transaction(async (tx) => {
      const created = await tx.alumno.create({
        data: {
          nombre: String(nombre).trim(),
          apellidos: String(apellidos).trim(),
          email: email ? String(email).trim() : null,
          identificadorExterno: identificadorExterno ? String(identificadorExterno).trim() : null,
          notasGenerales: notasGenerales ? String(notasGenerales).trim() : null,
        },
      });

      if (selectedSubjectIds.length) {
        await tx.matricula.createMany({
          data: selectedSubjectIds.map((asignaturaId) => ({ alumnoId: created.id, asignaturaId })),
        });
      }

      return created;
    });

    const created = await prisma.alumno.findUnique({
      where: { id: student.id },
      include: {
        matriculas: {
          where: { activa: true },
          include: { asignatura: true },
        },
      },
    });

    res.status(201).json(created);
  } catch (error) {
    next(error);
  }
});

studentsRouter.put("/:id", async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) {
      res.status(400).json({ error: "Identificador de alumno no válido" });
      return;
    }

    const { nombre, apellidos, email, identificadorExterno, notasGenerales, asignaturaIds, activo } = req.body;
    if (!nombre || !apellidos) {
      res.status(400).json({ error: "nombre y apellidos son obligatorios" });
      return;
    }

    const selectedSubjectIds = Array.isArray(asignaturaIds)
      ? Array.from(new Set(asignaturaIds.map(Number).filter(Number.isInteger)))
      : null;

    const existing = await prisma.alumno.findUnique({ where: { id } });
    if (!existing) {
      res.status(404).json({ error: "Alumno no encontrado" });
      return;
    }

    await prisma.$transaction(async (tx) => {
      await tx.alumno.update({
        where: { id },
        data: {
          nombre: String(nombre).trim(),
          apellidos: String(apellidos).trim(),
          email: email ? String(email).trim() : null,
          identificadorExterno: identificadorExterno ? String(identificadorExterno).trim() : null,
          notasGenerales: notasGenerales ? String(notasGenerales).trim() : null,
          activo: typeof activo === "boolean" ? activo : existing.activo,
        },
      });

      if (selectedSubjectIds !== null) {
        const enrollments = await tx.matricula.findMany({ where: { alumnoId: id } });
        const selected = new Set(selectedSubjectIds);

        for (const enrollment of enrollments) {
          const shouldBeActive = selected.has(enrollment.asignaturaId);
          if (shouldBeActive && !enrollment.activa) {
            await tx.matricula.update({
              where: { id: enrollment.id },
              data: { activa: true, fechaBaja: null, fechaAlta: new Date() },
            });
          } else if (!shouldBeActive && enrollment.activa) {
            await tx.matricula.update({
              where: { id: enrollment.id },
              data: { activa: false, fechaBaja: new Date() },
            });
          }
          selected.delete(enrollment.asignaturaId);
        }

        for (const asignaturaId of selected) {
          await tx.matricula.create({
            data: { alumnoId: id, asignaturaId },
          });
        }
      }
    });

    const updated = await prisma.alumno.findUnique({
      where: { id },
      include: {
        matriculas: {
          where: { activa: true },
          include: { asignatura: true },
        },
      },
    });

    res.json(updated);
  } catch (error) {
    next(error);
  }
});
