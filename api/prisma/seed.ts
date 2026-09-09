import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const course = await prisma.cursoAcademico.upsert({
    where: { nombre: "2026/2027" },
    update: { activo: true },
    create: {
      nombre: "2026/2027",
      fechaInicio: new Date("2026-09-01T00:00:00+02:00"),
      fechaFin: new Date("2027-07-31T00:00:00+02:00"),
      activo: true,
    },
  });

  const subjects = ["Lenguajes de Marcas", "Programación", "Entornos de Desarrollo"];

  for (const nombre of subjects) {
    await prisma.asignatura.upsert({
      where: {
        cursoAcademicoId_nombre_grupo: {
          cursoAcademicoId: course.id,
          nombre,
          grupo: "",
        },
      },
      update: { activa: true },
      create: {
        cursoAcademicoId: course.id,
        nombre,
        grupo: "",
      },
    });
  }

  console.log("Base local preparada: curso 2026/2027 y tres asignaturas creadas.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
