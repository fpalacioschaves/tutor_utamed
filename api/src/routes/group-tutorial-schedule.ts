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

// Las tutorías son distintas por grupo aunque la docencia síncrona de
// 1.º DAM/DAW se realice en una única asignatura compartida.
const SLOTS: Slot[] = [
  { code: "0373", group: "DAM", day: 2, start: "11:00", end: "11:45" },
  { code: "0485", group: "DAW", day: 3, start: "11:00", end: "12:00" },
  { code: "0485", group: "DAW", day: 2, start: "16:00", end: "17:00" },
  { code: "0487", group: "DAM", day: 4, start: "16:00", end: "16:45" },
  { code: "0485", group: "DAM", day: 4, start: "11:00", end: "12:00" },
  { code: "0485", group: "DAM", day: 1, start: "16:00", end: "17:00" },
  { code: "0373", group: "DAW", day: 1, start: "11:00", end: "11:45" },
  { code: "0487", group: "DAW", day: 1, start: "16:00", end: "16:45" },
];

const DAY_LABELS: Record<number, string> = {
  1: "Lunes",
  2: "Martes",
  3: "Miércoles",
  4: "Jueves",
};

// Exclusiones según "Hitos Mensuales" y "Cronograma Semanal" del archivo
// Temporalizacion_FP_Madrid_2026_2027.xlsx (no usar fiestas inferidas).
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

async function buildPreview() {
  const { course, resolved } = await resolveCourseAndSubjects();
  const subjectByCode = new Map(resolved.map(({ spec, subject }) => [spec.code, subject!]));
  const rows = SLOTS.flatMap((slot) =>
    datesForDay(slot.day).map((date) => ({
      slot,
      date,
      ref: reference(slot, date),
    })),
  );

  const existing = await prisma.sesion.findMany({
    where: { referenciaExterna: { in: rows.map((row) => row.ref) } },
    select: { referenciaExterna: true },
  });
  const existingRefs = new Set(existing.map((session) => session.referenciaExterna).filter(Boolean));
  const slots = SLOTS.map((slot) => {
    const planned = rows.filter((row) => slotKey(row.slot) === slotKey(slot));
    const assigned = subjectByCode.get(slot.code);
    return {
      ...slot,
      id: slotKey(slot),
      subjectId: assigned!.id,
      subjectName: SUBJECT_NAMES[slot.code],
      weekday: DAY_LABELS[slot.day],
      planned: planned.length,
      existing: planned.filter((row) => existingRefs.has(row.ref)).length,
      toCreate: planned.filter((row) => !existingRefs.has(row.ref)).length,
    };
  });

  return {
    course,
    firstDate: FROM,
    lastDate: THROUGH,
    slots,
    totalPlanned: rows.length,
    existing: existingRefs.size,
    toCreate: rows.length - existingRefs.size,
    nonTeaching: NON_TEACHING,
    overlapWarnings: [
      "Los lunes de 16:00 a 16:45 coinciden Programación (DAM, 16:00–17:00) y Entornos de Desarrollo (DAW, 16:00–16:45). Se respetan ambos horarios tal como se han facilitado.",
    ],
    rows,
  };
}

groupTutorialScheduleRouter.get("/preview", async (_req, res, next) => {
  try {
    const { rows: _rows, ...preview } = await buildPreview();
    res.json(preview);
  } catch (error) {
    next(error);
  }
});

groupTutorialScheduleRouter.post("/import", async (_req, res, next) => {
  try {
    const preview = await buildPreview();
    if (preview.toCreate === 0) {
      res.json({ created: 0, existing: preview.existing, totalPlanned: preview.totalPlanned, safetyBackup: null });
      return;
    }

    const byCode = new Map(preview.slots.map((slot) => [slot.code, slot.subjectId]));
    const existing = await prisma.sesion.findMany({
      where: { referenciaExterna: { in: preview.rows.map((row) => row.ref) } },
      select: { referenciaExterna: true },
    });
    const present = new Set(existing.map((session) => session.referenciaExterna).filter(Boolean));
    const planned = preview.rows
      .filter((row) => !present.has(row.ref))
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

    if (planned.length === 0) {
      res.json({ created: 0, existing: preview.totalPlanned, totalPlanned: preview.totalPlanned, safetyBackup: null });
      return;
    }

    const safetyBackup = await createBackup("PRE_IMPORT");
    // Lotes pequeños por el límite de parámetros SQL de SQLite. Toda la
    // importación se confirma o revierte en una única transacción.
    const batches = [];
    for (let index = 0; index < planned.length; index += 35) {
      batches.push(prisma.sesion.createMany({ data: planned.slice(index, index + 35) }));
    }
    await prisma.$transaction(batches);
    res.status(201).json({
      created: planned.length,
      existing: present.size,
      totalPlanned: preview.totalPlanned,
      safetyBackup,
    });
  } catch (error) {
    next(error);
  }
});
