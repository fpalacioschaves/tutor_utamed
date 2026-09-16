import { Router } from "express";
import { prisma } from "../lib/prisma";
import { createBackup } from "./backups";

export const academicScheduleImportRouter = Router();

type PlanItem = {
  week: number;
  date: string;
  title: string;
  type?: "CLASE" | "TUTORIA_GRUPAL";
  notes?: string;
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
  { week: 4, date: "2026-09-23", title: "Presentación de módulos y equipo directivo", notes: "Comienzo de clases síncronas · Envío de claves de acceso al aula virtual." },
  { week: 5, date: "2026-09-30", title: "Sesión Teórica 1", notes: "Publicación del Foro de Conocimientos Previos." },
  { week: 6, date: "2026-10-07", title: "Sesión Teórica 2", notes: "08/10: fecha límite de matriculación." },
  { week: 7, date: "2026-10-14", title: "Sesión Teórica 3", notes: "12/10: Fiesta Nacional." },
  { week: 8, date: "2026-10-21", title: "Sesión Teórica 4" },
  { week: 9, date: "2026-10-28", title: "Sesión Teórica 5", notes: "Apertura del Cuestionario PRL." },
  { week: 10, date: "2026-11-04", title: "Sesión de Repaso", notes: "Apertura del Cuestionario Evaluable 1 · 02/11: festivo de Todos los Santos." },
  { week: 11, date: "2026-11-11", title: "Sesión Teórica 6", notes: "09/11: festivo local de Madrid." },
  { week: 12, date: "2026-11-18", title: "Sesión Teórica 7", notes: "Cierre del Cuestionario PRL." },
  { week: 13, date: "2026-11-25", title: "Sesión Teórica 8", notes: "Publicación del Trabajo Enfoque Evaluable." },
  { week: 14, date: "2026-12-02", title: "Sesión Teórica 9" },
  { week: 15, date: "2026-12-09", title: "Sesión Teórica 10", notes: "Apertura PRL para suspensos/no presentados · 07-08/12: Constitución/Inmaculada." },
  { week: 16, date: "2026-12-16", title: "Sesión de Repaso", notes: "Apertura del Cuestionario Evaluable 2." },
  { week: 20, date: "2027-01-13", title: "Sesión Teórica 11", notes: "Reanudación de clases tras Navidad." },
  { week: 21, date: "2027-01-20", title: "Sesión Teórica 12", notes: "Fecha límite de entrega del Foro Evaluable." },
  { week: 22, date: "2027-01-27", title: "Sesión Teórica 13", notes: "Mitad del temario impartido · Apertura de la segunda mitad del temario al alumnado." },
  { week: 23, date: "2027-02-03", title: "Sesión Teórica 14", notes: "Publicación de nota y feedback del Foro Evaluable." },
  { week: 24, date: "2027-02-10", title: "Sesión de Repaso", notes: "Apertura del Cuestionario Evaluable 3 · 12-15/02: días no lectivos." },
  { week: 25, date: "2027-02-17", title: "Sesión Teórica 15", notes: "15/02: día no lectivo." },
  { week: 26, date: "2027-02-24", title: "Sesión Teórica 16", notes: "Límite de entrega del Trabajo Enfoque." },
  { week: 27, date: "2027-03-03", title: "Sesión Teórica 17" },
  { week: 28, date: "2027-03-10", title: "Sesión Teórica 18" },
  { week: 29, date: "2027-03-17", title: "Sesión de Repaso", notes: "Apertura del Cuestionario Evaluable 4 · 19/03: día no lectivo." },
  { week: 31, date: "2027-03-31", title: "Sesión Teórica 19", notes: "29/03: día no lectivo." },
  { week: 32, date: "2027-04-07", title: "Sesión Teórica 20" },
  { week: 33, date: "2027-04-14", title: "Sesión Teórica 21", notes: "Publicación de nota del Trabajo Enfoque." },
  { week: 34, date: "2027-04-21", title: "Sesión Teórica 22" },
  { week: 35, date: "2027-04-28", title: "Sesión de Repaso", notes: "Apertura del Cuestionario Evaluable 5." },
  { week: 36, date: "2027-05-05", title: "Repaso General" },
  { week: 37, date: "2027-05-12", title: "Simulacro de Examen", notes: "Fecha límite de entrega ordinaria de cuestionarios." },
  { week: 38, date: "2027-05-19", title: "Tutoría grupal / Dudas de examen", type: "TUTORIA_GRUPAL", notes: "22-23/05: exámenes ordinarios de 1.º curso." },
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
    select: { referenciaExterna: true },
  });
  const existingRefs = new Set(existing.map((item) => item.referenciaExterna).filter(Boolean));

  return {
    course,
    groupMode: "1.º DAM/DAW · grupo único",
    weeklyDays: PLAN.length,
    totalPlanned: PLAN.length * SUBJECTS.length,
    existing: existingRefs.size,
    toCreate: (PLAN.length * SUBJECTS.length) - existingRefs.size,
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
      select: { referenciaExterna: true },
    });
    const existingRefs = new Set(existing.map((item) => item.referenciaExterna).filter(Boolean));

    const rows = PLAN.flatMap((plan) =>
      SUBJECTS.map((spec) => {
        const subject = subjectByCode.get(spec.code)!;
        const ref = externalReference(spec.code, plan.date);
        return {
          ref,
          data: {
            asignaturaId: subject.id,
            unidadId: null,
            tipo: plan.type ?? "CLASE" as "CLASE" | "TUTORIA_GRUPAL",
            titulo: plan.title,
            tema: null,
            inicio: madridDateTime(plan.date, spec.start),
            fin: madridDateTime(plan.date, spec.end),
            estado: "PROGRAMADA" as const,
            origen: "IMPORTADA" as const,
            referenciaExterna: ref,
            observacionesGenerales: [
              `Temporalización FP Madrid 2026/2027 · Semana ${plan.week} · 1.º DAM/DAW (grupo único).`,
              plan.notes || null,
            ].filter(Boolean).join(" "),
          },
        };
      }),
    ).filter((row) => !existingRefs.has(row.ref));

    let safetyBackup = null;
    if (rows.length > 0) {
      safetyBackup = await createBackup("PRE_IMPORT");
      await prisma.$transaction(rows.map((row) => prisma.sesion.create({ data: row.data })));
    }

    res.status(rows.length > 0 ? 201 : 200).json({
      created: rows.length,
      skippedExisting: existingRefs.size,
      totalPlanned: refs.length,
      safetyBackup,
      preview: await getPreviewData(),
    });
  } catch (error) {
    next(error);
  }
});
