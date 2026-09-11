/* Catálogo de ofertas de empleo. En una siguiente iteración esto
   vendría de una base de datos administrada por las empresas aliadas. */

const JOBS = [
  {
    title: "Analista de Datos Jr.",
    company: "Nimbus Analytics",
    area: "tecnologia",
    modalidad: "remoto",
    exclusivo: true,
    location: "Remoto · LATAM",
    tags: ["SQL", "Excel", "Power BI"],
    desc: "Programa de inducción de 3 meses para egresados de carreras afines a datos, estadística o ingeniería."
  },
  {
    title: "Desarrollador Frontend Trainee",
    company: "Vertex Software",
    area: "tecnologia",
    modalidad: "hibrido",
    exclusivo: true,
    location: "Ciudad de México",
    tags: ["HTML/CSS", "JavaScript", "React"],
    desc: "Buscamos primera experiencia laboral. Mentoría técnica y plan de carrera desde el día uno."
  },
  {
    title: "Coordinador de Marketing Digital",
    company: "Brisa Studio",
    area: "marketing",
    modalidad: "remoto",
    exclusivo: false,
    location: "Remoto",
    tags: ["Redes sociales", "Copywriting", "Analytics"],
    desc: "Apoyo en estrategia de contenido para marcas emergentes. Se valora portafolio."
  },
  {
    title: "Analista Contable Jr.",
    company: "Grupo Andina",
    area: "finanzas",
    modalidad: "presencial",
    exclusivo: true,
    location: "Bogotá",
    tags: ["Excel", "NIIF", "Conciliaciones"],
    desc: "Vacante pensada para recién egresados de Contaduría o Finanzas. Capacitación interna incluida."
  },
  {
    title: "Diseñador/a UX/UI Jr.",
    company: "Estudio Norte",
    area: "diseno",
    modalidad: "hibrido",
    exclusivo: true,
    location: "Guadalajara",
    tags: ["Figma", "Prototipado", "Investigación de usuarios"],
    desc: "Únete a un equipo de producto que valora ideas frescas y perspectivas nuevas."
  },
  {
    title: "Ejecutivo/a de Atención al Cliente",
    company: "Puerto Claro",
    area: "ventas",
    modalidad: "presencial",
    exclusivo: false,
    location: "Lima",
    tags: ["Comunicación", "CRM", "Ventas"],
    desc: "Primer empleo formal con contrato y prestaciones desde el ingreso."
  },
  {
    title: "Ingeniero/a de Procesos Jr.",
    company: "Manufacturas del Sur",
    area: "ingenieria",
    modalidad: "presencial",
    exclusivo: true,
    location: "Monterrey",
    tags: ["Lean", "Excel", "AutoCAD"],
    desc: "Programa de rotación por distintas áreas de planta durante el primer año."
  },
  {
    title: "Product Marketing Trainee",
    company: "Halo Tech",
    area: "marketing",
    modalidad: "remoto",
    exclusivo: true,
    location: "Remoto · Latam",
    tags: ["Storytelling", "Growth", "Datos"],
    desc: "Aprenderás a lanzar productos digitales junto a un equipo senior de marketing."
  },
  {
    title: "Asistente de Finanzas Corporativas",
    company: "Cumbre Capital",
    area: "finanzas",
    modalidad: "hibrido",
    exclusivo: false,
    location: "Ciudad de Panamá",
    tags: ["Modelado financiero", "Excel avanzado"],
    desc: "Apoyo directo al equipo de tesorería. Ideal para egresados de Economía o Finanzas."
  }
];

function listJobs({ area, modalidad, exclusivo } = {}) {
  return JOBS.filter((job) => {
    if (area && job.area !== area) return false;
    if (modalidad && job.modalidad !== modalidad) return false;
    if (exclusivo === "true" && !job.exclusivo) return false;
    return true;
  });
}

module.exports = { listJobs };
