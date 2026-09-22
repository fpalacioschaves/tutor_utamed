import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type GroupName = "DAM" | "DAW";

function groupFromNotes(notes: string | null): GroupName | null {
  if (!notes) return null;
  const dam = /\bDAM\b|desarrollo de aplicaciones multiplataforma/i.test(notes);
  const daw = /\bDAW\b|desarrollo de aplicaciones web/i.test(notes);
  if (dam === daw) return null; // Ninguna coincidencia o ambas: no adivinar.
  return dam ? "DAM" : "DAW";
}

async function main() {
  const activeCourses = await prisma.cursoAcademico.findMany({
    where: { activo: true },
    select: { id: true },
  });

  // Los grupos pertenecen al curso académico, pero las asignaturas comunes
  // no se duplican por tener alumnado de dos ciclos.
  for (const course of activeCourses) {
    for (const nombre of ["DAM", "DAW"] as const) {
      await prisma.grupo.upsert({
        where: { cursoAcademicoId_nombre: { cursoAcademicoId: course.id, nombre } },
        create: { cursoAcademicoId: course.id, nombre },
        update: {},
      });
    }
  }

  const students = await prisma.alumno.findMany({
    where: { grupoId: null },
    select: {
      id: true,
      notasGenerales: true,
      matriculas: {
        select: { activa: true, asignatura: { select: { cursoAcademicoId: true } } },
      },
    },
  });

  let assigned = 0;
  const ambiguous: number[] = [];
  const noCourse: number[] = [];

  for (const student of students) {
    const nombre = groupFromNotes(student.notasGenerales);
    if (!nombre) {
      ambiguous.push(student.id);
      continue;
    }

    const activeEnrollments = student.matriculas.filter((enrollment) => enrollment.activa);
    const enrollments = activeEnrollments.length ? activeEnrollments : student.matriculas;
    const courses = [...new Set(enrollments.map((item) => item.asignatura.cursoAcademicoId))];
    const courseId = courses.length === 1
      ? courses[0]
      : courses.length === 0 && activeCourses.length === 1
        ? activeCourses[0].id
        : null;

    if (!courseId) {
      noCourse.push(student.id);
      continue;
    }

    const group = await prisma.grupo.upsert({
      where: { cursoAcademicoId_nombre: { cursoAcademicoId: courseId, nombre } },
      create: { cursoAcademicoId: courseId, nombre },
      update: {},
    });

    // No sobrescribir una asignación manual si se ejecuta otra vez.
    const result = await prisma.alumno.updateMany({
      where: { id: student.id, grupoId: null },
      data: { grupoId: group.id },
    });
    assigned += result.count;
  }

  console.log(`Grupos DAM/DAW: ${assigned} alumnos asignados; ${ambiguous.length} sin identificacion inequivoca; ${noCourse.length} sin curso inequivoco.`);
  if (ambiguous.length) console.log(`Revisar el grupo en la ficha de alumnos con ID: ${ambiguous.join(", ")}`);
  if (noCourse.length) console.log(`Revisar el curso academico de alumnos con ID: ${noCourse.join(", ")}`);
}

main()
  .catch((error) => {
    console.error("No se pudo completar la asignacion de grupos:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
