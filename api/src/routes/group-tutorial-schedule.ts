import { Router } from "express";
import { prisma } from "../lib/prisma";
import { createBackup } from "./backups";
import { resolveCourseAndSubjects } from "./academic-schedule-import";

export const groupTutorialScheduleRouter = Router();

type Group = "DAM" | "DAW";
type Slot = {
  code: "0373" | "0485" | "0487";
  group: Group;
  day: 1 | 2 | 3 | 4;
  start: string;
  end: string;
};

const FROM = "2026-09-21";
const THROUGH = "2027-06-18";

// Las clases síncronas son compartidas entre DAM y DAW. Las tutorías,
// en cambio, son independientes por asignatura y grupo.
const SLOTS: Slot[] = [
  { code: "0373", group: "DAM", day: 2, start: "11:00", end: "11:45" },
  { code: "0485", group: "DAW", day: 3, start: "11:00", end: "12:00" },
  { code: "0485", group: "DAW", day: 2, start: "16:00", end: "17:00" },
  { code: "0487", group: "DAM", day: 4, start: "16:00", end: "16:45" },
  { code: "0485", group: "DAM", day: 4, start: "11:00", end: "12:00" },
  { code: "0485", group: "DAM", day: 1, start: "17:00", end: "18:00" },
  { code: "0373", group: "DAW", day: 1, start: "11:00", end: "11:45" },
  { code: "0487", group: "DAW", day: 1, start: "16:00", end: "16:45" },
];

const CLASS_SLOTS = [
  { day: 3, name: "Entornos de Desarrollo · DAM/DAW", start: "16:00", end: "17:00" },
  { day: 3, name: "Lenguajes de Marcas · DAM/DAW", start: "17:00", end: "18:00" },
  { day: 3, name: "Programación · DAM/DAW", start: "18:00", end: "19:00" },
];

const DAY_LABELS: Record<number, string> = {
  1: "Lunes",
  2: "Martes",
  3: "Miércoles",
  4: "Jueves",
};

// Fechas no lectivas del archivo Temporalizacion_FP_Madrid_2026_2027.xlsx.
const NON_TEACHING: Array<{ from: string; through: string; label: string }> = [
  { from: "2026-10-12", through: "2026-10-12", label: "Fiesta Nacional" },
  { from: "2026-11-02", through: "2026-11-02", label: "Todos los Santos" },
  { from: "2026-11-09", through: "2026-11-09", label: "Fiesta local de Madrid" },
  { from: "2026-12-07", through: "2026-12-08", label: "Constitución / Inmaculada" },
  { from: "2026-12-23", through: "2027-01-10", label: "Vacaciones de Navidad" },
  { from: "2027-02-12", through: "2027-02-15", label: "Días no lectivos" },
  { from: "2027-03-19", through: "2027-03-19", label: "San José: no lectivo" },
  { from: "2027-03-22", through: "2027-03-28", label: "Semana Santa" },
  { from: "2027-03-29", through: "2027-03-29", label: "Día no lectivo" },
];

const SUBJECT_NAMES: Record<Slot["code"], string> = {
  "0373": "Lenguajes de Marcas",
  "0485": "Programación",
  "0487": "Entornos de Desarrollo",
};

function offsetMadrid(day: string) {
  return day >= "2026-10-25" && day < "2027-03-28" ? "+01:00" : "+02:00";
}

function zonedDate(day: string, time: string) {
  return new Date(`${day}T${time}:00${offsetMadrid(day)}`);
}

function excluded(day: string) {
  return NON_TEACHING.some((period) => day >= period.from && day <= period.through);
}

function reference(slot: Slot, day: string) {
  return `utamed-tutoria-2026-2027-${slot.code}-${slot.group}-${day}-${slot.start.replace(":", "")}`;
}

// Compatibilidad con la primera importación: Programación DAM los lunes
// se guardaba a las 16:00. Se traslada el MISMO registro a las 17:00
// conservando su identificador, estado, asistencias y observaciones externas.
function previousReference(slot: Slot, day: string): string | null {
  return slot.code === "0485" && slot.group === "DAM" && slot.day === 1
    ? `utamed-tutoria-2026-2027-0485-DAM-${day}-1600`
    : null;
}

function slotKey(slot: Slot) {
  return `${slot.code}-${slot.group}-${slot.day}-${slot.start}`;
}

function datesForDay(dayNumber: Slot["day"]) {
  const dates: string[] = [];
  for (
    let day = new Date(`${FROM}T12:00:00Z`);
    day.toISOString().slice(0, 10) <= THROUGH;
    day.setUTCDate(day.getUTCDate() + 1)
  ) {
    const iso = day.toISOString().slice(0, 10);
    if (day.getUTCDay() === dayNumber && !excluded(iso)) dates.push(iso);
  }
  return dates;
}

function minuteOfDay(value: string) {
  const [hour, minute] = value.split(":").map(Number);
  return hour * 60 + minute;
}

function intersects(a: { start: string; end: string }, b: { start: string; end: string }) {
  return minuteOfDay(a.start) < minuteOfDay(b.end)
    && minuteOfDay(b.start) < minuteOfDay(a.end);
}

function checkScheduleOverlaps() {
  const warnings: string[] = [];
  for (let index = 0; index < SLOTS.length; index += 1) {
    const slot = SLOTS[index];
    for (const other of SLOTS.slice(index + 1)) {
      if (slot.day !== other.day || !intersects(slot, other)) continue;
      warnings.push(`${DAY_LABELS[slot.day]}: ${SUBJECT_NAMES[slot.code]} ${slot.group} (${slot.start}–${slot.end}) coincide con ${SUBJECT_NAMES[other.code]} ${other.group} (${other.start}–${other.end}).`);
    }

    for (const classSlot of CLASS_SLOTS) {
      if (slot.day !== classSlot.day || !intersects(slot, classSlot)) continue;
      warnings.push(`${DAY_LABELS[slot.day]}: Tutoría ${SUBJECT_NAMES[slot.code]} ${slot.group} (${slot.start}–${slot.end}) coincide con la clase ${classSlot.name} (${classSlot.start}–${classSlot.end}).`);
    }
  }
  return warnings;
}

async function buildPreview() {
  const { course, resolved } = await resolveCourseAndSubjects();
  const subjectByCode = new Map(resolved.map(({ spec, subject }) => [spec.code, subject!]));
  const rows = SLOTS.flatMap((slot) =>
    datesForDay(slot.day).map((date) => ({
      slot,
      date,
      ref: reference(slot, date),
      oldRef: previousReference(slot, date),
    })),
  );

  const refs = rows.flatMap((row) => row.oldRef ? [row.ref, row.oldRef] : [row.ref]);
  const existing = await prisma.sesion.findMany({
    where: { referenciaExterna: { in: refs } },
    select: { id: true, referenciaExterna: true },
  });
  const byRef = new Map<string, typeof existing>();
  for (const session of existing) {
    if (!session.referenciaExterna) continue;
    const list = byRef.get(session.referenciaExterna) ?? [];
    list.push(session);
    byRef.set(session.referenciaExterna, list);
  }

  const conflicts = rows.flatMap((row) => {
    const current = byRef.get(row.ref) ?? [];
    const previous = row.oldRef ? byRef.get(row.oldRef) ?? [] : [];
    if (current.length + previous.length <= 1) return [];
    return [`${row.date}: existen varias tutorías importadas para ${SUBJECT_NAMES[row.slot.code]} ${row.slot.group}. Revísalas antes de sincronizar.`];
  });

  const status = (row: typeof rows[number]) => {
    const current = byRef.get(row.ref) ?? [];
    const previous = row.oldRef ? byRef.get(row.oldRef) ?? [] : [];
    if (current.length > 0) return "existing";
    if (previous.length > 0) return "toMove";
    return "toCreate";
  };

  const slots = SLOTS.map((slot) => {
    const planned = rows.filter((row) => slotKey(row.slot) === slotKey(slot));
    const assigned = subjectByCode.get(slot.code)!;
    return {
      ...slot,
      id: slotKey(slot),
      subjectId: assigned.id,
      subjectName: SUBJECT_NAMES[slot.code],
      weekday: DAY_LABELS[slot.day],
      planned: planned.length,
      existing: planned.filter((row) => status(row) === "existing").length,
      toMove: planned.filter((row) => status(row) === "toMove").length,
      toCreate: planned.filter((row) => status(row) === "toCreate").length,
    };
  });

  const toCreate = slots.reduce((sum, slot) => sum + slot.toCreate, 0);
  const toMove = slots.reduce((sum, slot) => sum + slot.toMove, 0);
  const existingCount = slots.reduce((sum, slot) => sum + slot.existing, 0);

  return {
    course,
    firstDate: FROM,
    lastDate: THROUGH,
    slots,
    totalPlanned: rows.length,
    existing: existingCount,
    toMove,
    toCreate,
    nonTeaching: NON_TEACHING,
    overlapWarnings: checkScheduleOverlaps(),
    conflicts,
    rows,
    byRef,
  };
}

groupTutorialScheduleRouter.get("/preview", async (_req, res, next) => {
  try {
    const { rows: _rows, byRef: _byRef, ...preview } = await buildPreview();
    res.json(preview);
  } catch (error) {
    next(error);
  }
});

groupTutorialScheduleRouter.post("/import", async (_req, res, next) => {
  try {
    const preview = await buildPreview();
    if (preview.overlapWarnings.length || preview.conflicts.length) {
      res.status(409).json({
        error: "Se han detectado conflictos de horario o tutorías duplicadas. Revisa la vista previa antes de importar.",
        overlapWarnings: preview.overlapWarnings,
        conflicts: preview.conflicts,
      });
      return;
    }

    const byCode = new Map(preview.slots.map((slot) => [slot.code, slot.subjectId]));
    const moves = preview.rows.flatMap((row) => {
      const current = preview.byRef.get(row.ref) ?? [];
      const previous = row.oldRef ? preview.byRef.get(row.oldRef) ?? [] : [];
      if (current.length > 0 || previous.length === 0) return [];
      const slot = row.slot;
      return [{
        id: previous[0].id,
        inicio: zonedDate(row.date, slot.start),
        fin: zonedDate(row.date, slot.end),
        referenciaExterna: row.ref,
        grupoTutoria: slot.group,
        observacionesGenerales: `Tutoría periódica de 1.º ${slot.group} · ${DAY_LABELS[slot.day]} ${slot.start}–${slot.end}. Grupos DAM y DAW diferenciados; clases síncronas compartidas.`,
      }];
    });

    const planned = preview.rows
      .filter((row) => !preview.byRef.has(row.ref) && (!row.oldRef || !preview.byRef.has(row.oldRef)))
      .map(({ slot, date, ref }) => ({
        asignaturaId: byCode.get(slot.code)!,
        unidadId: null,
        tipo: "TUTORIA_GRUPAL" as const,
        categoria: "TUTORIA_DUDAS",
        grupoTutoria: slot.group,
        titulo: `Tutoría · ${SUBJECT_NAMES[slot.code]} · ${slot.group}`,
        inicio: zonedDate(date, slot.start),
        fin: zonedDate(date, slot.end),
        estado: "PROGRAMADA" as const,
        origen: "IMPORTADA" as const,
        referenciaExterna: ref,
        observacionesGenerales: `Tutoría periódica de 1.º ${slot.group} · ${DAY_LABELS[slot.day]} ${slot.start}–${slot.end}. Grupos DAM y DAW diferenciados; clases síncronas compartidas.`,
      }));

    if (moves.length === 0 && planned.length === 0) {
      res.json({
        created: 0,
        moved: 0,
        existing: preview.existing,
        totalPlanned: preview.totalPlanned,
        safetyBackup: null,
      });
      return;
    }

    const safetyBackup = await createBackup("PRE_IMPORT");
    const operations = moves.map((move) =>
      prisma.sesion.update({
        where: { id: move.id },
        data: {
          inicio: move.inicio,
          fin: move.fin,
          referenciaExterna: move.referenciaExterna,
          grupoTutoria: move.grupoTutoria,
          observacionesGenerales: move.observacionesGenerales,
        },
      }),
    );

    // Inserciones agrupadas para SQLite; toda la operación se confirma
    // o revierte en una transacción junto con las correcciones de horario.
    for (let index = 0; index < planned.length; index += 35) {
      operations.push(prisma.sesion.createMany({ data: planned.slice(index, index + 35) }) as never);
    }
    await prisma.$transaction(operations);

    res.status(planned.length > 0 ? 201 : 200).json({
      created: planned.length,
      moved: moves.length,
      existing: preview.existing,
      totalPlanned: preview.totalPlanned,
      safetyBackup,
    });
  } catch (error) {
    next(error);
  }
});
