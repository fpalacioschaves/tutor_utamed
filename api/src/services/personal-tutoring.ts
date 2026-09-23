import { prisma } from "../lib/prisma";

// Guiones y plazos proporcionados por UTAMED para el curso 2026-2027.
// C1 no tiene fecha inicial explícita en el guion: no se inventa una.
export const GUIAS = [
  {
    numero: 1, titulo: "Inicio de curso", momento: "Primeros 15 días del curso. Plazo máximo: 2 de octubre de 2026",
    inicio: null, fin: "2026-10-02",
    contenido: "Presentación del Docente-Tutor y de sus vías de contacto; comprobar el acceso y adaptación al entorno virtual; revisar horario, temporalización y funcionamiento general; conocer primeras impresiones, necesidades y expectativas.",
  },
  {
    numero: 2, titulo: "Seguimiento del 1.º periodo", momento: "23 noviembre – 4 diciembre 2026",
    inicio: "2026-11-23", fin: "2026-12-04",
    contenido: "Revisar adaptación y evolución académica; conocer objetivos y expectativas; comprobar participación y seguimiento; recordar fechas relevantes; informar sobre la Fase de Formación en Empresa (procedimiento para proponer un centro propio) y detectar necesidades de apoyo.",
  },
  {
    numero: 3, titulo: "Seguimiento intermedio", momento: "22 febrero – 5 marzo 2027",
    inicio: "2027-02-22", fin: "2027-03-05",
    contenido: "Informar y conversar sobre la evolución; revisar preparación de pruebas, actividades y módulos; tratar la Fase de Formación en Empresa (recoger preferencias); acordar medidas ante dificultades.",
  },
  {
    numero: 4, titulo: "Seguimiento final previo", momento: "12 – 23 abril 2027",
    inicio: "2027-04-12", fin: "2027-04-23",
    contenido: "Revisar la evolución global, módulos con riesgo o pendientes, preparación de la evaluación final y situación de la Fase de Formación en Empresa; establecer medidas de mejora o recuperación cuando sean necesarias.",
  },
  {
    numero: 5, titulo: "Cierre de curso", momento: "31 mayo – 20 junio 2027",
    inicio: "2027-05-31", fin: "2027-06-20",
    contenido: "Hacer balance del curso y de los resultados; revisar recuperaciones o cuestiones pendientes; recoger propuestas de mejora; orientar sobre el curso siguiente o, cuando corresponda, sobre continuidad académica y profesional.",
  },
] as const;

export function madridDay(date = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Madrid", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(date);
}

export async function personalTutoringOverview() {
  const alumnos = await prisma.alumno.findMany({
    where: { activo: true, tutorizadoPersonalmente: true },
    select: {
      id: true, nombre: true, apellidos: true, grupoId: true,
      grupo: { select: { nombre: true } },
      contactosPersonales: {
        orderBy: { numero: "asc" },
        select: {
          id: true, numero: true, fecha: true, medio: true,
          observaciones: true, acuerdos: true,
        },
      },
    },
    orderBy: [{ apellidos: "asc" }, { nombre: "asc" }],
  });
  const today = madridDay();
  const periodos = GUIAS.map(guia => {
    const completed = alumnos.flatMap(a => a.contactosPersonales.filter(c => c.numero === guia.numero));
    const realizados = completed.length;
    const pendientes = alumnos.length - realizados;
    const fueraPlazo = completed.filter(c => {
      const day = c.fecha.toISOString().slice(0, 10);
      return day > guia.fin || (guia.inicio !== null && day < guia.inicio);
    }).length;
    const estado = pendientes === 0 ? "COMPLETO"
      : today > guia.fin ? "VENCIDO"
      : guia.inicio !== null && today < guia.inicio ? "PROXIMO"
      : "EN_PLAZO";
    return { ...guia, total: alumnos.length, realizados, pendientes, fueraPlazo, estado };
  });
  const destacada = periodos.find(p => p.estado === "VENCIDO")
    ?? periodos.find(p => p.estado === "EN_PLAZO")
    ?? periodos.find(p => p.estado === "PROXIMO")
    ?? periodos[periodos.length - 1];
  return { alumnos, periodos, destacada, totalAlumnos: alumnos.length, fechaActual: today };
}
