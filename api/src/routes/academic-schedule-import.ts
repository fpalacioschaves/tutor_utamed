import { Router } from "express";
import { prisma } from "../lib/prisma";
import { createBackup } from "./backups";

export const academicScheduleImportRouter = Router();

type SessionCategory = "PRESENTACION" | "TEORICA" | "REPASO" | "REPASO_GENERAL" | "SIMULACRO" | "TUTORIA_DUDAS";

type PlanItem = {
  week: number;
  date: string;
  title: string;
  category: SessionCategory;
  type?: "CLASE" | "TUTORIA_GRUPAL";
  milestone?: string;
  observations?: string;
};

type SubjectSpec = {
  code: string;
  name: string;
  aliases: string[];
  start: string;
  end: string;
};

const SUBJECTS: SubjectSpec[] = [
  {
    code: "0487",
    name: "Entornos de Desarrollo",
    aliases: ["entornos de desarrollo"],
    start: "16:00",
    end: "17:00",
  },
  {
    code: "0373",
    name: "Lenguajes de Marcas",
    aliases: [
      "lenguajes de marcas",
      "lenguajes de marcas y sistemas de gestion de informacion",
    ],
    start: "17:00",
    end: "18:00",
  },
  {
    code: "0485",
    name: "Programación",
    aliases: ["programacion"],
    start: "18:00",
    end: "19:00",
  },
];

const PLAN: PlanItem[] = [
  { week: 4, date: "2026-09-23", title: "Sesión 1: Presentación Módulos y Eq. Directivo", category: "PRESENTACION", milestone: "Envío claves acceso aula virtual", observations: "Comienzo clases síncronas" },
  { week: 5, date: "2026-09-30", title: "Sesión Teórica 1", category: "TEORICA", milestone: "Publicación Foro Conocimientos Previos" },
  { week: 6, date: "2026-10-07", title: "Sesión Teórica 2", category: "TEORICA", observations: "08/10: Fecha límite matriculación" },
  { week: 7, date: "2026-10-14", title: "Sesión Teórica 3", category: "TEORICA", observations: "12/10: Fiesta Nacional" },
  { week: 8, date: "2026-10-21", title: "Sesión Teórica 4", category: "TEORICA" },
  { week: 9, date: "2026-10-28", title: "Sesión Teórica 5", category: "TEORICA", milestone: "Apertura Cuestionario PRL" },
  { week: 10, date: "2026-11-04", title: "Sesión : Repaso", category: "REPASO", milestone: "Apertura Cuestionario Evaluable 1", observations: "02/11: Festivo (Todos los Santos)" },
  { week: 11, date: "2026-11-11", title: "Sesión Teórica 6", category: "TEORICA", observations: "09/11: Festivo local Madrid" },
  { week: 12, date: "2026-11-18", title: "Sesión Teórica 7", category: "TEORICA", milestone: "Cierre Cuestionario PRL" },
  { week: 13, date: "2026-11-25", title: "Sesión Teórica 8", category: "TEORICA", milestone: "Publicación Trabajo Enfoque Evaluable" },
  { week: 14, date: "2026-12-02", title: "Sesión Teórica 9", category: "TEORICA" },
  { week: 15, date: "2026-12-09", title: "Sesión Teórica 10", category: "TEORICA", milestone: "Apertura PRL (Suspensos / No pres.)", observations: "07-08/12: Festivo Constitución / Inmaculada" },
  { week: 16, date: "2026-12-16", title: "Sesión Repaso", category: "REPASO", milestone: "Apertura Cuestionario Evaluable 2" },
  { week: 20, date: "2027-01-13", title: "Sesión Teórica 11", category: "TEORICA", milestone: "Reanudación de clases" },
  { week: 21, date: "2027-01-20", title: "Sesión Teórica 12", category: "TEORICA", milestone: "Fecha límite entrega Foro Evaluable" },
  { week: 22, date: "2027-01-27", title: "Sesión Teórica 13", category: "TEORICA", milestone: "Apertura para el alumno de la 2ª mitad temario", observations: "Hito: Se ha impartido la mitad del temario" },
  { week: 23, date: "2027-02-03", title: "Sesión Teórica 14", category: "TEORICA", milestone: "Publicación nota y feedback Foro Evaluable" },
  { week: 24, date: "2027-02-10", title: "Sesión 18: Repaso", category: "REPASO", milestone: "Apertura Cuestionario Evaluable 3", observations: "12-15/02: Días no lectivos" },
  { week: 25, date: "2027-02-17", title: "Sesión Teórica 15", category: "TEORICA", observations: "15/02: Día no lectivo" },
  { week: 26, date: "2027-02-24", title: "Sesión Teórica 16", category: "TEORICA", milestone: "LÍMITE ENTREGA Trabajo Enfoque", observations: "Límite entrega Trabajo" },
  { week: 27, date: "2027-03-03", title: "Sesión Teórica 17", category: "TEORICA" },
  { week: 28, date: "2027-03-10", title: "Sesión Teórica 18", category: "TEORICA" },
  { week: 29, date: "2027-03-17", title: "Sesión 23: Repaso", category: "REPASO", milestone: "Apertura Cuestionario Evaluable 4", observations: "19/03: Día no lectivo" },
  { week: 31, date: "2027-03-31", title: "Sesión Teórica 19", category: "TEORICA", observations: "29/03: Día no lectivo" },
  { week: 32, date: "2027-04-07", title: "Sesión Teórica 20", category: "TEORICA" },
  { week: 33, date: "2027-04-14", title: "Sesión Teórica 21", category: "TEORICA", milestone: "Publicación nota Trabajo Enfoque" },
  { week: 34, date: "2027-04-21", title: "Sesión Teórica 22", category: "TEORICA" },
  { week: 35, date: "2027-04-28", title: "Sesión 28: Repaso", category: "REPASO", milestone: "Apertura Cuestionario Evaluable 5" },
  { week: 36, date: "2027-05-05", title: "Sesión 29: Repaso General", category: "REPASO_GENERAL" },
  { week: 37, date: "2027-05-12", title: "Sesión 30: Simulacro Examen", category: "SIMULACRO", milestone: "FECHA LÍMITE ENTREGA ORDINARIA CUESTIONARIOS", observations: "Cierre cuestionarios evaluables ordinaria" },
  { week: 38, date: "2027-05-19", title: "Sesión 31: Tutorías / Dudas Examen", category: "TUTORIA_DUDAS", type: "TUTORIA_GRUPAL", observations: "22 y 23/05: EXÁMENES ORDINARIOS 1º CURSO" },
];

const OMITTED = [
  "23/12/2026: no se crea sesión porque las vacaciones de Navidad comienzan ese día.",
  "30/12/2026 y 06/01/2027: vacaciones de Navidad.",
  "24/03/2027: Semana Santa.",
  "Desde la semana del 24/05/2027 la temporalización entra en evaluación/convocatorias y no programa una clase síncrona ordinaria.",
];

function normalize(value: string | null | undefined) {
  return (value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function groupScore(group: string | null | undefined) {
  const value = normalize(group);
  if (/dam.*daw|daw.*dam/.test(value)) return 30;
  if (value === "") return 20;
  if (value.includes("1")) return 10;
  return 0;
}

function madridOffset(date: string) {
  return date >= "2026-10-25" && date < "2027-03-28" ? "+01:00" : "+02:00";
}

function madridDateTime(date: string, time: string) {
  return new Date(`${date}T${time}:00${madridOffset(date)}`);
}

async function resolveCourseAndSubjects() {
  const course = await prisma.cursoAcademico.findUnique({
    where: { nombre: "2026/2027" },
    select: { id: true, nombre: true },
  });

  if (!course) {
    throw new Error("No existe el curso académico 2026/2027.");
  }

  const subjects = await prisma.asignatura.findMany({
    where: { cursoAcademicoId: course.id, activa: true },
    select: { id: true, nombre: true, codigo: true, grupo: true, grupoId: true },
    orderBy: { id: "asc" },
  });

  const resolved = SUBJECTS.map((spec) => {
    const aliases = new Set(spec.aliases.map(normalize));
    const candidates = subjects
      .filter((subject) => {
        if (normalize(subject.codigo) === normalize(spec.code)) return true;
        const name = normalize(subject.nombre);
        return aliases.has(name) || spec.aliases.some((alias) => name.includes(normalize(alias)));
      })
      .sort((a, b) => {
        const codeA = normalize(a.codigo) === normalize(spec.code) ? 100 : 0;
        const codeB = normalize(b.codigo) === normalize(spec.code) ? 100 : 0;
        return (codeB + groupScore(b.grupo)) - (codeA + groupScore(a.grupo)) || a.id - b.id;
      });

    return { spec, subject: candidates[0] ?? null, alternatives: candidates.length };
  });

  const missing = resolved.filter((item) => !item.subject).map((item) => item.spec.name);
  if (missing.length > 0) {
    throw new Error(`No se han encontrado estas asignaturas del curso 2026/2027: ${missing.join(", ")}.`);
  }

  return { course, resolved };
}

function externalReference(code: string, date: string) {
  return `utamed-2026-2027-${code}-${date}`;
}

async function getPreviewData() {
  const { course, resolved } = await resolveCourseAndSubjects();
  const refs = PLAN.flatMap((plan) => SUBJECTS.map((subject) => externalReference(subject.code, plan.date)));
  const existing = await prisma.sesion.findMany({
    where: { referenciaExterna: { in: refs } },
    select: { id: true, referenciaExterna: true },
  });
  const existingRefs = new Set(existing.map((item) => item.referenciaExterna).filter(Boolean));

  return {
    course,
    groupMode: "1.º DAM/DAW · grupo único",
    weeklyDays: PLAN.length,
    totalPlanned: PLAN.length * SUBJECTS.length,
    existing: existingRefs.size,
    toCreate: (PLAN.length * SUBJECTS.length) - existingRefs.size,
    toSynchronize: existingRefs.size,
    firstDate: PLAN[0].date,
    lastDate: PLAN[PLAN.length - 1].date,
    subjects: resolved.map(({ spec, subject, alternatives }) => ({
      code: spec.code,
      expectedName: spec.name,
      time: `${spec.start}–${spec.end}`,
      subject,
      alternatives,
    })),
    omitted: OMITTED,
  };
}

academicScheduleImportRouter.get("/preview", async (_req, res, next) => {
  try {
    res.json(await getPreviewData());
  } catch (error) {
    next(error);
  }
});

academicScheduleImportRouter.post("/import", async (_req, res, next) => {
  try {
    const { resolved } = await resolveCourseAndSubjects();
    const subjectByCode = new Map(resolved.map(({ spec, subject }) => [spec.code, subject!]));

    const refs = PLAN.flatMap((plan) => SUBJECTS.map((subject) => externalReference(subject.code, plan.date)));
    const existing = await prisma.sesion.findMany({
      where: { referenciaExterna: { in: refs } },
      select: { id: true, referenciaExterna: true },
    });
    const existingByRef = new Map(existing.map((item) => [item.referenciaExterna, item]));

    const rows = PLAN.flatMap((plan) =>
      SUBJECTS.map((spec) => {
        const subject = subjectByCode.get(spec.code)!;
        const ref = externalReference(spec.code, plan.date);
        const notes = [
          plan.milestone ? `Aperturas / Entregas / Cierres: ${plan.milestone}` : null,
          plan.observations ? `Observaciones / Festivos: ${plan.observations}` : null,
        ].filter(Boolean).join("\n");

        const sharedData = {
          asignaturaId: subject.id,
          tipo: (plan.type ?? "CLASE") as "CLASE" | "TUTORIA_GRUPAL",
          categoria: plan.category,
          titulo: plan.title,
          inicio: madridDateTime(plan.date, spec.start),
          fin: madridDateTime(plan.date, spec.end),
          referenciaExterna: ref,
          observacionesGenerales: notes || null,
        };

        return {
          ref,
          existing: existingByRef.get(ref) ?? null,
          updateData: sharedData,
          createData: {
            ...sharedData,
            unidadId: null,
            tema: null,
            estado: "PROGRAMADA" as const,
            origen: "IMPORTADA" as const,
          },
        };
      }),
    );

    const toCreate = rows.filter((row) => !row.existing);
    const toUpdate = rows.filter((row) => row.existing);

    let safetyBackup = null;
    if (rows.length > 0) {
      safetyBackup = await createBackup("PRE_IMPORT");
      await prisma.$transaction([
        ...toUpdate.map((row) => prisma.sesion.update({ where: { id: row.existing!.id }, data: row.updateData })),
        ...toCreate.map((row) => prisma.sesion.create({ data: row.createData })),
      ]);
    }

    res.status(toCreate.length > 0 ? 201 : 200).json({
      created: toCreate.length,
      updated: toUpdate.length,
      totalPlanned: refs.length,
      safetyBackup,
      preview: await getPreviewData(),
    });
  } catch (error) {
    next(error);
  }
});


type UnitAllocationStrategy = "HORAS_PREVISTAS" | "EQUILIBRADO";

type AllocationUnit = {
  id: number;
  orden: number;
  titulo: string;
  horasPrevistas: number | null;
};

function distributeSessionCounts(units: AllocationUnit[], totalSessions: number) {
  if (units.length === 0) return { strategy: "EQUILIBRADO" as UnitAllocationStrategy, counts: [] as number[] };
  if (units.length > totalSessions) {
    throw new Error(`Hay ${units.length} unidades activas para solo ${totalSessions} sesiones teóricas.`);
  }

  const allHoursAvailable = units.every((unit) => typeof unit.horasPrevistas === "number" && unit.horasPrevistas > 0);
  if (!allHoursAvailable) {
    const base = Math.floor(totalSessions / units.length);
    const remainder = totalSessions % units.length;
    return {
      strategy: "EQUILIBRADO" as UnitAllocationStrategy,
      counts: units.map((_unit, index) => base + (index < remainder ? 1 : 0)),
    };
  }

  const remaining = totalSessions - units.length;
  const totalHours = units.reduce((sum, unit) => sum + (unit.horasPrevistas ?? 0), 0);
  const exactExtras = units.map((unit) => remaining * ((unit.horasPrevistas ?? 0) / totalHours));
  const extras = exactExtras.map((value) => Math.floor(value));
  let left = remaining - extras.reduce((sum, value) => sum + value, 0);

  const remainderOrder = exactExtras
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);

  for (const item of remainderOrder) {
    if (left <= 0) break;
    extras[item.index] += 1;
    left -= 1;
  }

  return {
    strategy: "HORAS_PREVISTAS" as UnitAllocationStrategy,
    counts: extras.map((extra) => extra + 1),
  };
}

async function buildUnitAllocationPreview() {
  const { resolved } = await resolveCourseAndSubjects();

  const subjects = await Promise.all(resolved.map(async ({ spec, subject }) => {
    const units = await prisma.unidad.findMany({
      where: { asignaturaId: subject!.id, activa: true },
      select: { id: true, orden: true, titulo: true, horasPrevistas: true },
      orderBy: { orden: "asc" },
    });

    const sessions = await prisma.sesion.findMany({
      where: {
        asignaturaId: subject!.id,
        categoria: "TEORICA",
        referenciaExterna: { startsWith: `utamed-2026-2027-${spec.code}-` },
      },
      select: {
        id: true,
        titulo: true,
        inicio: true,
        unidadId: true,
      },
      orderBy: { inicio: "asc" },
    });

    const issues: string[] = [];
    if (sessions.length !== 22) {
      issues.push(`Se esperaban 22 sesiones teóricas importadas y hay ${sessions.length}.`);
    }
    if (units.length === 0) {
      issues.push("No hay unidades activas en esta asignatura.");
    }
    if (units.length > 22) {
      issues.push(`Hay ${units.length} unidades activas para solo 22 sesiones teóricas.`);
    }

    if (issues.length > 0) {
      return {
        code: spec.code,
        subject: { id: subject!.id, nombre: subject!.nombre },
        ready: false,
        issues,
        strategy: null,
        units: units.map((unit) => ({ ...unit, sessions: 0, from: null, to: null })),
        assignments: [],
        sessionCount: sessions.length,
        changesNeeded: 0,
        alreadyCorrect: 0,
      };
    }

    const distribution = distributeSessionCounts(units, 22);
    let sessionIndex = 0;
    const assignments: Array<{
      sessionId: number;
      sessionNumber: number;
      title: string | null;
      date: string;
      currentUnitId: number | null;
      unitId: number;
      unitOrder: number;
      unitTitle: string;
    }> = [];

    const unitRanges = units.map((unit, unitIndex) => {
      const count = distribution.counts[unitIndex];
      const from = sessionIndex + 1;
      const to = sessionIndex + count;

      for (let offset = 0; offset < count; offset += 1) {
        const session = sessions[sessionIndex + offset];
        assignments.push({
          sessionId: session.id,
          sessionNumber: sessionIndex + offset + 1,
          title: session.titulo,
          date: session.inicio.toISOString(),
          currentUnitId: session.unidadId,
          unitId: unit.id,
          unitOrder: unit.orden,
          unitTitle: unit.titulo,
        });
      }

      sessionIndex += count;
      return {
        ...unit,
        sessions: count,
        from,
        to,
      };
    });

    const changesNeeded = assignments.filter((assignment) => assignment.currentUnitId !== assignment.unitId).length;

    return {
      code: spec.code,
      subject: { id: subject!.id, nombre: subject!.nombre },
      ready: true,
      issues: [],
      strategy: distribution.strategy,
      units: unitRanges,
      assignments,
      sessionCount: sessions.length,
      changesNeeded,
      alreadyCorrect: assignments.length - changesNeeded,
    };
  }));

  return {
    ready: subjects.every((subject) => subject.ready),
    totalTheoreticalSessions: subjects.reduce((sum, subject) => sum + subject.sessionCount, 0),
    changesNeeded: subjects.reduce((sum, subject) => sum + subject.changesNeeded, 0),
    alreadyCorrect: subjects.reduce((sum, subject) => sum + subject.alreadyCorrect, 0),
    subjects,
  };
}

academicScheduleImportRouter.get("/unit-allocation-preview", async (_req, res, next) => {
  try {
    res.json(await buildUnitAllocationPreview());
  } catch (error) {
    next(error);
  }
});

academicScheduleImportRouter.post("/unit-allocation-apply", async (_req, res, next) => {
  try {
    const preview = await buildUnitAllocationPreview();
    if (!preview.ready) {
      res.status(409).json({
        error: "No se puede aplicar el reparto mientras haya asignaturas con incidencias.",
        preview,
      });
      return;
    }

    const assignments = preview.subjects
      .flatMap((subject) => subject.assignments)
      .filter((assignment) => assignment.currentUnitId !== assignment.unitId);

    if (assignments.length === 0) {
      res.json({
        updated: 0,
        safetyBackup: null,
        preview,
        message: "Las sesiones teóricas ya tienen el reparto de unidades correcto.",
      });
      return;
    }

    const safetyBackup = await createBackup("PRE_UNIT_ALLOCATION");

    await prisma.$transaction(
      assignments.map((assignment) =>
        prisma.sesion.update({
          where: { id: assignment.sessionId },
          data: { unidadId: assignment.unitId },
        }),
      ),
    );

    res.json({
      updated: assignments.length,
      safetyBackup,
      preview: await buildUnitAllocationPreview(),
      message: "Unidades asignadas a las sesiones teóricas correctamente.",
    });
  } catch (error) {
    next(error);
  }
});
