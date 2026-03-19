import { PrismaClient, RolUsuario, AreaJuzgado, TipoJuzgado, CategoriaProceso, ClaseProceso, EstadoProceso, TipoProvidencia, EstadoProvidencia, TipoAuto, TipoMemorial, EstadoMemorial, TipoDocumento, TipoTarea, EstadoTarea, PrioridadTarea, CarpetaArchivo, TipoInstancia } from '@prisma/client';
import bcrypt from 'bcrypt';

const prisma = new PrismaClient();
const hash = (p: string) => bcrypt.hashSync(p, 10);

async function main() {
  console.log('🌱 Iniciando seed con estructura Despacho/Secretaría...\n');

  // ==================== JUZGADO ====================
  // codigoRadicacion12: primeros 12 dígitos (Acuerdo 201/1997) - Bogotá 11001, Circuito 31, Civil 03, Despacho 051
  let juzgado = await prisma.juzgado.findFirst({ where: { codigo: '11-031-CIV-051' } });
  if (!juzgado) {
    juzgado = await prisma.juzgado.create({
      data: {
        nombre: 'Juzgado Civil del Circuito 31 - Despacho 051',
        codigo: '11-031-CIV-051',
        codigoRadicacion12: '110013103051',
        tipoJuzgado: TipoJuzgado.CIVIL_CIRCUITO,
        ciudad: 'Bogotá D.C.',
        direccion: 'Palacio de Justicia, Carrera 7 No. 16-20, Piso 3',
        telefono: '+57 601 5462080',
        email: 'juzgado1civilcircuitobog@ramajudicial.gov.co',
      }
    });
    console.log('✅ Juzgado creado:', juzgado.nombre);
  } else {
    console.log('✅ Juzgado existente:', juzgado.nombre);
  }

  // ==================== TIPOS DE PROCESO - BORRAR ANTERIORES Y RECREAR ====================
  await prisma.tipoProcesoEstadistica.deleteMany({ where: { juzgadoId: juzgado.id } })

  // ==================== TIPOS CIVILES (24) ====================
  const TIPOS_CIVILES: Array<{ nombre: string; codigo?: string; orden: number; claseProceso?: ClaseProceso }> = [
    { nombre: 'DECLARATIVOS VERBAL PERTENENCIA', codigo: 'DVP', orden: 1, claseProceso: ClaseProceso.VERBAL },
    { nombre: 'DECLARATIVOS VERBAL SERVIDUMBRES', codigo: 'DVS', orden: 2, claseProceso: ClaseProceso.VERBAL },
    { nombre: 'DECLARATIVOS - VERBAL-IMPUGNACIÓN DE ACTAS DE ASAMBLEAS, JUNTAS DIRECTIVAS O DE SOCIOS.', codigo: 'DVI', orden: 3, claseProceso: ClaseProceso.VERBAL },
    { nombre: 'DECLARATIVOS VERBAL DECLARACIÓN DE BIENES VACANTES O MOSTRENCOS', codigo: 'DVB', orden: 4, claseProceso: ClaseProceso.VERBAL },
    { nombre: 'DECLARATIVOS ESPECIALES DIVISORIO', codigo: 'DED', orden: 5, claseProceso: ClaseProceso.DIVISORIO },
    { nombre: 'DECLARATIVOS ESPECIALES EXPROPIACIÓN', codigo: 'DEE', orden: 6, claseProceso: ClaseProceso.ORDINARIO },
    { nombre: 'DECLARATIVOS ESPECIALES DESLINDE Y AMOJONAMIENTO', codigo: 'DEDAM', orden: 7, claseProceso: ClaseProceso.ORDINARIO },
    { nombre: 'EJECUTIVOS', codigo: 'EJE', orden: 8, claseProceso: ClaseProceso.EJECUTIVO_SINGULAR },
    { nombre: 'EJECUTIVOS CON GARANTÍA REAL', codigo: 'EGR', orden: 9, claseProceso: ClaseProceso.EJECUTIVO_HIPOTECARIO },
    { nombre: 'RESPONSABILIDAD MEDICA', codigo: 'RM', orden: 10, claseProceso: ClaseProceso.ORDINARIO },
    { nombre: 'RESPONSABILIDAD CIVIL EXTRACONTRACTUAL', codigo: 'RCE', orden: 11, claseProceso: ClaseProceso.ORDINARIO },
    { nombre: 'RESPONSABILIDAD CIVIL CONTRACTUAL', codigo: 'RCC', orden: 12, claseProceso: ClaseProceso.ORDINARIO },
    { nombre: 'INSOLVENCIA DE LA PERSONA NATURAL', codigo: 'IPN', orden: 13, claseProceso: ClaseProceso.ORDINARIO },
    { nombre: 'INSOLVENCIA DE SOCIEDADES', codigo: 'IS', orden: 14, claseProceso: ClaseProceso.ORDINARIO },
    { nombre: 'PROCESOS DE LIQUIDACIÓN - LIQUIDACIÓN DE SOCIEDADES POR INCUMPLIMIENTO DE ACUERDO DE REORGANIZACIÓN', codigo: 'PL1', orden: 15, claseProceso: ClaseProceso.LIQUIDACION },
    { nombre: 'PROCESOS DE LIQUIDACIÓN - DISOLUCIÓN, NULIDAD Y LIQUIDACIÓN DE SOCIEDADES', codigo: 'PL2', orden: 16, claseProceso: ClaseProceso.LIQUIDACION },
    { nombre: 'PROCESOS DE LIQUIDACIÓN - OTROS', codigo: 'PL3', orden: 17, claseProceso: ClaseProceso.LIQUIDACION },
    { nombre: 'PROCESOS DE JURISDICCIÓN VOLUNTARIA', codigo: 'PJV', orden: 18, claseProceso: ClaseProceso.ORDINARIO },
    { nombre: 'COMPETENCIA DESLEAL', codigo: 'CD', orden: 19, claseProceso: ClaseProceso.ORDINARIO },
    { nombre: 'PROPIEDAD INTELECTUAL', codigo: 'PI', orden: 20, claseProceso: ClaseProceso.ORDINARIO },
    { nombre: 'PROCESOS DE PROTECCIÓN DE DERECHO AL CONSUMIDOR', codigo: 'PPDC', orden: 21, claseProceso: ClaseProceso.ORDINARIO },
    { nombre: 'DECLARATORIA DE AUSENCIA POR DESAPARICIÓN FORZADA', codigo: 'DADF', orden: 22, claseProceso: ClaseProceso.ORDINARIO },
    { nombre: 'CONCILIACIÓN EXTRAJUDICIAL', codigo: 'CE', orden: 23, claseProceso: ClaseProceso.ORDINARIO },
    { nombre: 'OTROS PROCESOS', codigo: 'OTROS', orden: 24, claseProceso: ClaseProceso.ORDINARIO },
  ];

  for (const t of TIPOS_CIVILES) {
    await prisma.tipoProcesoEstadistica.upsert({
      where: { juzgadoId_categoriaProceso_nombre: { juzgadoId: juzgado.id, categoriaProceso: CategoriaProceso.CIVIL, nombre: t.nombre } },
      create: { juzgadoId: juzgado.id, categoriaProceso: CategoriaProceso.CIVIL, nombre: t.nombre, codigo: t.codigo ?? null, orden: t.orden, claseProceso: t.claseProceso ?? null },
      update: { codigo: t.codigo ?? null, orden: t.orden, claseProceso: t.claseProceso ?? null },
    });
  }

  // ==================== TIPOS TUTELA (12 - por derecho protegido) ====================
  const TIPOS_TUTELA: Array<{ nombre: string; codigo: string; orden: number }> = [
    { nombre: 'SALUD', codigo: 'SAL', orden: 1 },
    { nombre: 'SEGURIDAD SOCIAL', codigo: 'SS', orden: 2 },
    { nombre: 'VIDA', codigo: 'VID', orden: 3 },
    { nombre: 'MÍNIMO VITAL', codigo: 'MV', orden: 4 },
    { nombre: 'IGUALDAD', codigo: 'IG', orden: 5 },
    { nombre: 'EDUCACIÓN', codigo: 'EDU', orden: 6 },
    { nombre: 'DEBIDO PROCESO', codigo: 'DP', orden: 7 },
    { nombre: 'DERECHO DE PETICIÓN', codigo: 'DPET', orden: 8 },
    { nombre: 'DERECHO A LA INFORMACIÓN PÚBLICA', codigo: 'DIP', orden: 9 },
    { nombre: 'CONTRA PROVIDENCIAS JUDICIALES', codigo: 'CPJ', orden: 10 },
    { nombre: 'MEDIO AMBIENTE', codigo: 'MA', orden: 11 },
    { nombre: 'OTROS', codigo: 'OTROS', orden: 12 },
  ];

  for (const t of TIPOS_TUTELA) {
    await prisma.tipoProcesoEstadistica.upsert({
      where: { juzgadoId_categoriaProceso_nombre: { juzgadoId: juzgado.id, categoriaProceso: CategoriaProceso.CONSTITUCIONAL, nombre: t.nombre } },
      create: { juzgadoId: juzgado.id, categoriaProceso: CategoriaProceso.CONSTITUCIONAL, nombre: t.nombre, codigo: t.codigo, orden: t.orden, claseProceso: ClaseProceso.TUTELA },
      update: { codigo: t.codigo, orden: t.orden },
    });
  }

  const tiposCiviles = await prisma.tipoProcesoEstadistica.findMany({
    where: { juzgadoId: juzgado.id, categoriaProceso: CategoriaProceso.CIVIL },
    orderBy: { orden: 'asc' },
  });
  const tiposTutela = await prisma.tipoProcesoEstadistica.findMany({
    where: { juzgadoId: juzgado.id, categoriaProceso: CategoriaProceso.CONSTITUCIONAL },
    orderBy: { orden: 'asc' },
  });
  const tipoPorNombreCivil = Object.fromEntries(tiposCiviles.map(t => [t.nombre, t.id]));
  const tipoPorNombreTutela = Object.fromEntries(tiposTutela.map(t => [t.nombre, t.id]));
  const tipoEjecutivos = tipoPorNombreCivil['EJECUTIVOS'] ?? tiposCiviles[0]?.id;
  const tipoEjecutivosGarantia = tipoPorNombreCivil['EJECUTIVOS CON GARANTÍA REAL'] ?? tiposCiviles[0]?.id;
  const tipoDivisorio = tipoPorNombreCivil['DECLARATIVOS ESPECIALES DIVISORIO'] ?? tiposCiviles[0]?.id;
  const tipoLiquidacion = tipoPorNombreCivil['PROCESOS DE LIQUIDACIÓN - OTROS'] ?? tiposCiviles[0]?.id;
  const tipoResponsabilidadMedica = tipoPorNombreCivil['RESPONSABILIDAD MEDICA'] ?? tiposCiviles[0]?.id;
  const tipoRCE = tipoPorNombreCivil['RESPONSABILIDAD CIVIL EXTRACONTRACTUAL'] ?? tiposCiviles[0]?.id;
  const tipoRCC = tipoPorNombreCivil['RESPONSABILIDAD CIVIL CONTRACTUAL'] ?? tiposCiviles[0]?.id;
  const tipoVerbalPertenencia = tipoPorNombreCivil['DECLARATIVOS VERBAL PERTENENCIA'] ?? tiposCiviles[0]?.id;
  const tipoVerbalServidumbre = tipoPorNombreCivil['DECLARATIVOS VERBAL SERVIDUMBRES'] ?? tiposCiviles[0]?.id;
  const tipoOtros = tipoPorNombreCivil['OTROS PROCESOS'] ?? tiposCiviles[0]?.id;
  const tipoTutelaSalud = tipoPorNombreTutela['SALUD'] ?? tiposTutela[0]?.id;
  const tipoTutelaEducacion = tipoPorNombreTutela['EDUCACIÓN'] ?? tiposTutela[0]?.id;
  const tipoTutelaSeguridadSocial = tipoPorNombreTutela['SEGURIDAD SOCIAL'] ?? tiposTutela[0]?.id;
  const tipoTutelaOtros = tipoPorNombreTutela['OTROS'] ?? tiposTutela[0]?.id;

  console.log('✅ Tipos civiles: 24 | Tipos tutela (por derecho): 12');

  // ==================== USUARIOS POR ÁREA ====================
  const upsertUsuario = async (email: string, data: { email: string; nombre: string; password: string; rol: RolUsuario; area: AreaJuzgado; juzgadoId: string | null }) => {
    return prisma.usuario.upsert({
      where: { email },
      create: data,
      update: { nombre: data.nombre, rol: data.rol, area: data.area, juzgadoId: data.juzgadoId, password: data.password },
    });
  };

  // DESPACHO
  const juez = await upsertUsuario('juez@ramajudicial.gov.co', {
    email: 'juez@ramajudicial.gov.co',
    nombre: 'Dr. Carlos Hernando Rodríguez Pérez',
    password: hash('juez123'),
    rol: RolUsuario.JUEZ,
    area: AreaJuzgado.DESPACHO,
    juzgadoId: juzgado.id,
  });

  const oficialMayor1 = await upsertUsuario('oficial1@ramajudicial.gov.co', {
    email: 'oficial1@ramajudicial.gov.co',
    nombre: 'Dra. María Fernanda López Gómez',
    password: hash('oficial123'),
    rol: RolUsuario.OFICIAL_MAYOR,
    area: AreaJuzgado.DESPACHO,
    juzgadoId: juzgado.id,
  });

  const oficialMayor2 = await upsertUsuario('oficial2@ramajudicial.gov.co', {
    email: 'oficial2@ramajudicial.gov.co',
    nombre: 'Dr. Andrés Felipe Martínez Ruiz',
    password: hash('oficial123'),
    rol: RolUsuario.OFICIAL_MAYOR,
    area: AreaJuzgado.DESPACHO,
    juzgadoId: juzgado.id,
  });

  // SECRETARÍA
  const secretario = await upsertUsuario('secretario@ramajudicial.gov.co', {
    email: 'secretario@ramajudicial.gov.co',
    nombre: 'Dra. Laura Victoria Sánchez Herrera',
    password: hash('secretario123'),
    rol: RolUsuario.SECRETARIO,
    area: AreaJuzgado.SECRETARIA,
    juzgadoId: juzgado.id,
  });

  const escribiente1 = await upsertUsuario('escribiente1@ramajudicial.gov.co', {
    email: 'escribiente1@ramajudicial.gov.co',
    nombre: 'Sra. Claudia Patricia Moreno Díaz',
    password: hash('escribiente123'),
    rol: RolUsuario.ESCRIBIENTE,
    area: AreaJuzgado.SECRETARIA,
    juzgadoId: juzgado.id,
  });

  const escribiente2 = await upsertUsuario('escribiente2@ramajudicial.gov.co', {
    email: 'escribiente2@ramajudicial.gov.co',
    nombre: 'Sr. Juan Sebastián Torres Vargas',
    password: hash('escribiente123'),
    rol: RolUsuario.ESCRIBIENTE,
    area: AreaJuzgado.SECRETARIA,
    juzgadoId: juzgado.id,
  });

  const asistente = await upsertUsuario('asistente@ramajudicial.gov.co', {
    email: 'asistente@ramajudicial.gov.co',
    nombre: 'Sra. Diana Carolina Ramírez Pérez',
    password: hash('asistente123'),
    rol: RolUsuario.ASISTENTE_JUDICIAL,
    area: AreaJuzgado.SECRETARIA,
    juzgadoId: juzgado.id,
  });

  // SUPER_ADMIN (sin juzgado, acceso total)
  await prisma.usuario.upsert({
    where: { email: 'superadmin@ramajudicial.gov.co' },
    create: {
      email: 'superadmin@ramajudicial.gov.co',
      nombre: 'Administrador del Sistema',
      password: hash('superadmin123'),
      rol: RolUsuario.SUPER_ADMIN,
      area: AreaJuzgado.SECRETARIA, // irrelevante para super admin
      juzgadoId: null,
    },
    update: { rol: RolUsuario.SUPER_ADMIN, juzgadoId: null },
  });

  console.log('✅ Usuarios creados:');
  console.log('   DESPACHO: Juez, 2 Oficiales Mayores');
  console.log('   SECRETARÍA: Secretario, 2 Escribientes, 1 Asistente');
  console.log('   SUPER_ADMIN: Administrador del Sistema');

  // ==================== PROCESOS JUDICIALES (30 civiles + 10 tutelas, primera instancia - radicado termina en 00) ====================
  
  // Eliminar procesos existentes para recrear con datos de ejemplo (cascade elimina cuadernos, providencias, etc.)
  await prisma.proceso.deleteMany({ where: { juzgadoId: juzgado.id } });

  const CODIGO12 = '110013103051';
  const ANIO = 2025;
  const oficiales = [oficialMayor1.id, oficialMayor2.id];

  const getTipoEst = (clase: ClaseProceso, demanda: string): string | undefined => {
    if (demanda.includes('hipotecario') || demanda.includes('prendario')) return tipoEjecutivosGarantia;
    if (clase === ClaseProceso.EJECUTIVO_SINGULAR || clase === ClaseProceso.EJECUTIVO_HIPOTECARIO || clase === ClaseProceso.EJECUTIVO_PRENDARIO) return tipoEjecutivos;
    if (clase === ClaseProceso.DIVISORIO) return tipoDivisorio;
    if (clase === ClaseProceso.LIQUIDACION) return tipoLiquidacion;
    if (demanda.includes('Responsabilidad médica') || demanda.includes('médica')) return tipoResponsabilidadMedica;
    if (demanda.includes('Daños') || demanda.includes('extracontractual')) return tipoRCE;
    if (demanda.includes('contractual') || demanda.includes('Incumplimiento') || demanda.includes('póliza') || demanda.includes('Cobro')) return tipoRCC;
    if (demanda.includes('Servidumbre')) return tipoVerbalServidumbre;
    if (clase === ClaseProceso.VERBAL || clase === ClaseProceso.POSESORIO || clase === ClaseProceso.VERBAL_SUMARIO) return tipoVerbalPertenencia;
    return tipoOtros;
  };

  // 30 procesos civiles de ejemplo (radicados 00001-00030, terminan en 00 = primera instancia)
  const civiles: Array<{ clase: ClaseProceso; demanda: string; demandante: string; demandado: string; cuantia?: number; etapa: string }> = [
    { clase: ClaseProceso.EJECUTIVO_SINGULAR, demanda: 'Banco de Bogotá vs. Constructora El Progreso - Ejecutivo hipotecario', demandante: 'Banco de Bogotá S.A.', demandado: 'Constructora El Progreso S.A.S.', cuantia: 850000000, etapa: 'Ejecución' },
    { clase: ClaseProceso.ORDINARIO, demanda: 'Gómez Rodríguez vs. Seguros Bolívar - Reclamación póliza de vida', demandante: 'María del Pilar Gómez Rodríguez', demandado: 'Seguros Bolívar S.A.', cuantia: 320000000, etapa: 'Pruebas' },
    { clase: ClaseProceso.VERBAL, demanda: 'Rodríguez Vargas vs. García Moreno - Resolución contrato compraventa', demandante: 'Ana Lucía Rodríguez Vargas', demandado: 'Pedro García Moreno', cuantia: 180000000, etapa: 'Audiencia Inicial' },
    { clase: ClaseProceso.EJECUTIVO_SINGULAR, demanda: 'Davivienda vs. Inmobiliaria Norte - Ejecutivo singular', demandante: 'Banco Davivienda S.A.', demandado: 'Inmobiliaria Norte S.A.S.', cuantia: 450000000, etapa: 'Admisión' },
    { clase: ClaseProceso.ORDINARIO, demanda: 'Martínez López vs. Clínica Colsanitas - Responsabilidad médica', demandante: 'Carlos Martínez López', demandado: 'Clínica Colsanitas S.A.', cuantia: 280000000, etapa: 'Peritaje' },
    { clase: ClaseProceso.VERBAL_SUMARIO, demanda: 'Pérez Díaz vs. Transportadora Andina - Daños y perjuicios', demandante: 'Laura Pérez Díaz', demandado: 'Transportadora Andina S.A.S.', cuantia: 95000000, etapa: 'Conciliación' },
    { clase: ClaseProceso.EJECUTIVO_HIPOTECARIO, demanda: 'Bancolombia vs. Familia Rodríguez - Ejecutivo hipotecario', demandante: 'Bancolombia S.A.', demandado: 'Familia Rodríguez Pérez', cuantia: 620000000, etapa: 'Embargo' },
    { clase: ClaseProceso.POSESORIO, demanda: 'Herrera Gómez vs. Ocupantes - Acción posesoria', demandante: 'Alberto Herrera Gómez', demandado: 'Ocupantes de hecho', cuantia: 150000000, etapa: 'Traslado' },
    { clase: ClaseProceso.ORDINARIO, demanda: 'Constructora ABC vs. Contratista XYZ - Incumplimiento contractual', demandante: 'Constructora ABC S.A.S.', demandado: 'Contratista XYZ Ltda.', cuantia: 380000000, etapa: 'Pruebas' },
    { clase: ClaseProceso.EJECUTIVO_SINGULAR, demanda: 'Fiduciaria vs. Deudor - Cobro cartera', demandante: 'Fiduciaria La Previsora S.A.', demandado: 'Juan Deudor López', cuantia: 125000000, etapa: 'Notificación' },
    { clase: ClaseProceso.VERBAL, demanda: 'Sánchez Ruiz vs. Arrendador - Rescisión arrendamiento', demandante: 'Miguel Sánchez Ruiz', demandado: 'Inversiones Inmobiliarias S.A.', cuantia: 75000000, etapa: 'Audiencia' },
    { clase: ClaseProceso.LIQUIDACION, demanda: 'Herederos García vs. Albacea - Liquidación sucesión', demandante: 'Herederos de José García', demandado: 'Albacea designado', cuantia: 520000000, etapa: 'Inventario' },
    { clase: ClaseProceso.SUCESORIO, demanda: 'Familia Martínez - Sucesión intestada', demandante: 'María Martínez (solicitante)', demandado: 'Herederos', cuantia: 890000000, etapa: 'Apertura' },
    { clase: ClaseProceso.DIVISORIO, demanda: 'Condominio vs. Copropietarios - División de cosa común', demandante: 'Conjunto Residencial Los Robles', demandado: 'Copropietarios', cuantia: 210000000, etapa: 'Peritaje' },
    { clase: ClaseProceso.RENDICION_CUENTAS, demanda: 'Beneficiarios vs. Albacea - Rendición de cuentas', demandante: 'Beneficiarios testamentarios', demandado: 'Albacea testamentario', cuantia: 340000000, etapa: 'Revisión' },
    { clase: ClaseProceso.TERCERIAS, demanda: 'Tercerista vs. Ejecutante - Tercería de dominio', demandante: 'Propietario del bien embargado', demandado: 'Banco ejecutante', cuantia: 180000000, etapa: 'Admisión' },
    { clase: ClaseProceso.ORDINARIO, demanda: 'Empresa Tech vs. Ex empleado - Indemnización laboral', demandante: 'Tech Solutions S.A.S.', demandado: 'Andrés Fernández (ex empleado)', cuantia: 95000000, etapa: 'Traslado' },
    { clase: ClaseProceso.EJECUTIVO_PRENDARIO, demanda: 'Leasing vs. Arrendatario - Ejecutivo prendario', demandante: 'Leasing Andino S.A.', demandado: 'Transportes Rápidos S.A.S.', cuantia: 220000000, etapa: 'Embargo' },
    { clase: ClaseProceso.VERBAL, demanda: 'Restrepo vs. Vecino - Servidumbre de paso', demandante: 'Carlos Restrepo Mejía', demandado: 'Propietario colindante', cuantia: 45000000, etapa: 'Inspección' },
    { clase: ClaseProceso.ORDINARIO, demanda: 'Asociación vs. Constructor - Vicios ocultos obra', demandante: 'Asociación de Propietarios', demandado: 'Constructora Sur S.A.S.', cuantia: 410000000, etapa: 'Peritaje' },
    { clase: ClaseProceso.EJECUTIVO_SINGULAR, demanda: 'Cooperativa vs. Asociado - Cobro cuota', demandante: 'Cooperativa de Ahorro', demandado: 'Asociado moroso', cuantia: 28000000, etapa: 'Notificación' },
    { clase: ClaseProceso.ORDINARIO, demanda: 'Clínica vs. Paciente - Cobro de servicios', demandante: 'Clínica del Country S.A.', demandado: 'Familia López Pérez', cuantia: 125000000, etapa: 'Pruebas' },
    { clase: ClaseProceso.POSESORIO, demanda: 'Inversiones vs. Ocupantes - Desalojo', demandante: 'Inversiones Urbanas S.A.', demandado: 'Ocupantes precarios', cuantia: 95000000, etapa: 'Traslado' },
    { clase: ClaseProceso.VERBAL_SUMARIO, demanda: 'Contratista vs. Propietario - Pago obra', demandante: 'Contratista General Ltda.', demandado: 'Propietario del inmueble', cuantia: 165000000, etapa: 'Conciliación' },
    { clase: ClaseProceso.ORDINARIO, demanda: 'Asegurado vs. Aseguradora - Negativa de cobertura', demandante: 'Pedro Gómez Asegurado', demandado: 'Seguros del Estado S.A.', cuantia: 195000000, etapa: 'Traslado' },
    { clase: ClaseProceso.EJECUTIVO_SINGULAR, demanda: 'Proveedor vs. Cliente - Cobro facturas', demandante: 'Distribuidora Nacional S.A.S.', demandado: 'Supermercados La Economía', cuantia: 78000000, etapa: 'Admisión' },
    { clase: ClaseProceso.ORDINARIO, demanda: 'Arrendatario vs. Arrendador - Reparación locativa', demandante: 'Comercializadora ABC Ltda.', demandado: 'Centro Comercial Plaza', cuantia: 45000000, etapa: 'Inspección' },
    { clase: ClaseProceso.VERBAL, demanda: 'Vecinos vs. Ruidos - Molestias por ruido', demandante: 'Conjunto de vecinos', demandado: 'Bar La Esquina', cuantia: 35000000, etapa: 'Audiencia' },
    { clase: ClaseProceso.ORDINARIO, demanda: 'Accionista vs. Sociedad - Nulidad de asamblea', demandante: 'Accionista minoritario', demandado: 'Empresa Industrial S.A.', cuantia: 520000000, etapa: 'Traslado' },
    { clase: ClaseProceso.EJECUTIVO_SINGULAR, demanda: 'Entidad financiera vs. Codeudor - Cobro solidario', demandante: 'Financiera Comultrasan', demandado: 'Codeudor solidario', cuantia: 89000000, etapa: 'Notificación' },
    { clase: ClaseProceso.ORDINARIO, demanda: 'Comprador vs. Vendedor - Nulidad de compraventa', demandante: 'Adquiriente del inmueble', demandado: 'Vendedor y tradente', cuantia: 380000000, etapa: 'Pruebas' },
  ];

  const procesosCreados: Array<{ id: string; radicado: string; claseProceso: string }> = [];

  for (let i = 0; i < 30; i++) {
    const c = civiles[i];
    const radicado = `${CODIGO12}${ANIO}${String(i + 1).padStart(5, '0')}00`; // 00 = primera instancia
    const tipoEstId = getTipoEst(c.clase, c.demanda);
    const p = await prisma.proceso.create({
      data: {
        radicado,
        instancia: TipoInstancia.PRIMERA_INSTANCIA,
        categoriaProceso: CategoriaProceso.CIVIL,
        claseProceso: c.clase,
        tipoProcesoEstadisticaId: tipoEstId,
        demanda: c.demanda,
        demandante: c.demandante,
        demandado: c.demandado,
        cuantia: c.cuantia,
        moneda: 'COP',
        estado: EstadoProceso.ACTIVO,
        etapaProcesal: c.etapa,
        juzgadoId: juzgado.id,
        oficialMayorId: oficiales[i % 2],
        secretarioId: secretario.id,
        fechaEntradaDespacho: i < 5 ? new Date(Date.now() - (i + 1) * 24 * 60 * 60 * 1000) : undefined,
        fechaLimiteDespacho: i < 5 ? new Date(Date.now() + (5 - i) * 24 * 60 * 60 * 1000) : undefined,
      }
    });
    await prisma.cuaderno.create({ data: { procesoId: p.id, nombre: 'Cuaderno principal', orden: 0 } });
    procesosCreados.push({ id: p.id, radicado: p.radicado, claseProceso: p.claseProceso });
  }

  // 10 tutelas (radicados 00031-00040) - cada una con tipo por derecho protegido
  const tutelas: Array<{ demanda: string; demandante: string; demandado: string; tipoTutelaId: string }> = [
    { demanda: 'Pérez Martínez vs. EPS Sanitas - Derecho a la salud', demandante: 'Juan Carlos Pérez Martínez', demandado: 'EPS Sanitas S.A.', tipoTutelaId: tipoTutelaSalud },
    { demanda: 'García López vs. Alcaldía - Derecho a la educación', demandante: 'María García López', demandado: 'Alcaldía Local de Chapinero', tipoTutelaId: tipoTutelaEducacion },
    { demanda: 'Rodríguez vs. ARL - Derecho a pensión', demandante: 'Luis Rodríguez Sánchez', demandado: 'ARL Sura', tipoTutelaId: tipoTutelaSeguridadSocial },
    { demanda: 'Martínez vs. EPS Famisanar - Negativa de medicamentos', demandante: 'Ana Martínez Díaz', demandado: 'EPS Famisanar', tipoTutelaId: tipoTutelaSalud },
    { demanda: 'Hernández vs. Registraduría - Derecho al voto', demandante: 'Carlos Hernández Gómez', demandado: 'Registraduría Nacional', tipoTutelaId: tipoTutelaOtros },
    { demanda: 'López vs. ICBF - Derecho de familia', demandante: 'Laura López Pérez', demandado: 'ICBF', tipoTutelaId: tipoTutelaOtros },
    { demanda: 'Sánchez vs. EPS Compensar - Cirugía urgente', demandante: 'Pedro Sánchez Ruiz', demandado: 'EPS Compensar', tipoTutelaId: tipoTutelaSalud },
    { demanda: 'Gómez vs. Empresa de servicios - Corte ilegal', demandante: 'Familia Gómez Herrera', demandado: 'Empresa de Acueducto', tipoTutelaId: tipoTutelaOtros },
    { demanda: 'Díaz vs. EPS Nueva EPS - Tratamiento oncológico', demandante: 'Carmen Díaz Martínez', demandado: 'Nueva EPS', tipoTutelaId: tipoTutelaSalud },
    { demanda: 'Torres vs. Secretaría de Salud - Historia clínica', demandante: 'Roberto Torres López', demandado: 'Secretaría Distrital de Salud', tipoTutelaId: tipoPorNombreTutela['DERECHO A LA INFORMACIÓN PÚBLICA'] ?? tipoTutelaOtros },
  ];

  for (let i = 0; i < 10; i++) {
    const t = tutelas[i];
    const radicado = `${CODIGO12}${ANIO}${String(31 + i).padStart(5, '0')}00`; // 00 = primera instancia
    const p = await prisma.proceso.create({
      data: {
        radicado,
        instancia: TipoInstancia.PRIMERA_INSTANCIA,
        categoriaProceso: CategoriaProceso.CONSTITUCIONAL,
        claseProceso: ClaseProceso.TUTELA,
        tipoProcesoEstadisticaId: t.tipoTutelaId,
        demanda: t.demanda,
        demandante: t.demandante,
        demandado: t.demandado,
        estado: EstadoProceso.ACTIVO,
        etapaProcesal: 'Primera Instancia',
        observaciones: i < 3 ? 'Término preferencial 10 días - Art. 86 CP' : undefined,
        juzgadoId: juzgado.id,
        oficialMayorId: oficiales[i % 2],
        secretarioId: secretario.id,
        fechaEntradaDespacho: i < 3 ? new Date(Date.now() - i * 24 * 60 * 60 * 1000) : undefined,
        fechaLimiteDespacho: i < 3 ? new Date(Date.now() + (8 - i) * 24 * 60 * 60 * 1000) : undefined,
      }
    });
    await prisma.cuaderno.create({ data: { procesoId: p.id, nombre: 'Cuaderno principal', orden: 0 } });
    procesosCreados.push({ id: p.id, radicado: p.radicado, claseProceso: p.claseProceso });
  }

  const proceso1 = (await prisma.proceso.findUnique({ where: { radicado: `${CODIGO12}${ANIO}0000100` } }))!;
  const proceso2 = (await prisma.proceso.findUnique({ where: { radicado: `${CODIGO12}${ANIO}0000200` } }))!;
  const proceso3 = (await prisma.proceso.findUnique({ where: { radicado: `${CODIGO12}${ANIO}0003100` } }))!; // Primera tutela
  const proceso4 = (await prisma.proceso.findUnique({ where: { radicado: `${CODIGO12}${ANIO}0000400` } }))!;

  console.log('✅ Procesos creados: 30 civiles + 10 tutelas (radicados terminan en 00 = primera instancia)');

  // ==================== PROVIDENCIAS (DESPACHO) ====================
  
  // Auto admisorio (proyectado por Oficial Mayor, firmado por Juez)
  const autoAdmisorio = await prisma.providencia.create({
    data: {
      procesoId: proceso1.id,
      tipo: TipoProvidencia.AUTO,
      numero: '001',
      fecha: new Date('2024-01-15'),
      asunto: 'Auto Admisorio - Admisión de la Demanda',
      contenido: 'Por medio del cual se admite la demanda presentada por el Banco de Bogotá contra Constructora El Progreso S.A.S...',
      estado: EstadoProvidencia.FIRMADO,
      tipoAuto: TipoAuto.ADMISORIO,
      proyectadoPorId: oficialMayor1.id,
      fechaProyeccion: new Date('2024-01-14'),
      firmadoPorId: juez.id,
      fechaFirma: new Date('2024-01-15'),
      notificado: true,
      fechaNotificacion: new Date('2024-01-18'),
    }
  });

  // Auto de medidas cautelares
  const autoMedidas = await prisma.providencia.create({
    data: {
      procesoId: proceso1.id,
      tipo: TipoProvidencia.AUTO,
      numero: '002',
      fecha: new Date('2024-01-20'),
      asunto: 'Auto que Decreta Medidas Cautelares - Embargo y Secuestro',
      contenido: 'Se decreta medida cautelar de embargo y secuestro sobre el bien inmueble...',
      estado: EstadoProvidencia.FIRMADO,
      tipoAuto: TipoAuto.LEVANTAMIENTO_MEDIDA,
      proyectadoPorId: oficialMayor2.id,
      fechaProyeccion: new Date('2024-01-19'),
      firmadoPorId: juez.id,
      fechaFirma: new Date('2024-01-20'),
      notificado: true,
      fechaNotificacion: new Date('2024-01-22'),
    }
  });

  // Auto en proyección (pendiente de firma)
  const autoProyectado = await prisma.providencia.create({
    data: {
      procesoId: proceso2.id,
      tipo: TipoProvidencia.AUTO,
      numero: '003',
      fecha: new Date(),
      asunto: 'Auto que Decreta Prueba Pericial Médica',
      contenido: 'Se decreta la práctica de peritaje médico para determinar el grado de incapacidad...',
      estado: EstadoProvidencia.PENDIENTE_FIRMA,
      tipoAuto: TipoAuto.PRACTICA_PRUEBAS,
      proyectadoPorId: oficialMayor1.id,
      fechaProyeccion: new Date(),
    }
  });

  // Sentencia en corrección
  const sentenciaEnProceso = await prisma.providencia.create({
    data: {
      procesoId: proceso4.id,
      tipo: TipoProvidencia.SENTENCIA,
      numero: '001',
      fecha: new Date(),
      asunto: 'Sentencia - Resolución de Contrato de Compraventa',
      contenido: 'FALLASE: PRIMERO. Declarar resuelto el contrato de compraventa...',
      estado: EstadoProvidencia.CORRECCION,
      proyectadoPorId: oficialMayor2.id,
      fechaProyeccion: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000),
      observaciones: 'Devuelto para corrección de errores materiales en la parte resolutiva.',
    }
  });

  console.log('✅ Providencias creadas: 3 Autos, 1 Sentencia en trámite');

  // ==================== MEMORIALES (SECRETARÍA) ====================
  
  const memorial1 = await prisma.memorial.create({
    data: {
      procesoId: proceso1.id,
      tipo: TipoMemorial.DEMANDA,
      numero: '001',
      fechaPresentacion: new Date('2024-01-10'),
      presentante: 'Dr. Felipe Andrés Contreras Rueda',
      identificacion: '12345678',
      asunto: 'Demanda Ejecutiva Singular',
      folios: 45,
      anexos: 'Poder, Título valor, Certificado de tradición',
      recibidoPorId: escribiente1.id,
      fechaRecibido: new Date('2024-01-10'),
      estado: EstadoMemorial.TRASLADADO,
    }
  });

  const memorial2 = await prisma.memorial.create({
    data: {
      procesoId: proceso1.id,
      tipo: TipoMemorial.SOLICITUD_PRUEBAS,
      numero: '002',
      fechaPresentacion: new Date('2024-02-15'),
      presentante: 'Dra. Carolina Herrera Vargas',
      identificacion: '34567890',
      asunto: 'Solicitud de práctica de pruebas - Testigos',
      folios: 8,
      anexos: 'Lista de testigos',
      recibidoPorId: escribiente2.id,
      fechaRecibido: new Date('2024-02-15'),
      estado: EstadoMemorial.RADICADO,
    }
  });

  const memorial3 = await prisma.memorial.create({
    data: {
      procesoId: proceso3.id,
      tipo: TipoMemorial.DEMANDA,
      numero: '001',
      fechaPresentacion: new Date('2024-03-01'),
      presentante: 'Juan Carlos Pérez Martínez (Personal)',
      identificacion: '79876543',
      asunto: 'Acción de Tutela - Derecho a la Salud',
      folios: 12,
      anexos: 'Historia clínica, Negativa de servicio, Derechos de petición',
      recibidoPorId: secretario.id,
      fechaRecibido: new Date('2024-03-01'),
      estado: EstadoMemorial.RADICADO,
      observaciones: 'Caso urgente - solicitar trámite preferencial',
    }
  });

  console.log('✅ Memoriales creados: 3 registrados');

  // ==================== OFICIOS (SECRETARÍA) ====================
  
  const oficio1 = await prisma.oficio.create({
    data: {
      procesoId: proceso1.id,
      numero: 'OFI-2024-001',
      destinatario: 'Oficina de Registro de Instrumentos Públicos de Bogotá',
      destinatarioId: '899999001-1',
      tipoDestinatario: 'REGISTRO_INSTRUMENTOS',
      direccion: 'Carrera 10 No. 28-20',
      asunto: 'Solicitud de Certificado de Tradición y Libertad',
      contenido: 'Se solicita expedir certificado de tradición y libertad del inmueble matrícula 50N-123456...',
      estado: 'ENVIADO',
      fechaEnvio: new Date('2024-01-25'),
    }
  });

  const oficio2 = await prisma.oficio.create({
    data: {
      procesoId: proceso1.id,
      numero: 'OFI-2024-002',
      destinatario: 'Banco de Bogotá S.A.',
      destinatarioId: '860002545-1',
      tipoDestinatario: 'BANCO',
      direccion: 'Carrera 7 No. 24-50',
      email: 'gestionjudicial@bancodebogota.com.co',
      asunto: 'Solicitud de Certificación de Saldos',
      contenido: 'Se solicita certificación de saldos del crédito hipotecario número CH-2020-12345...',
      estado: 'PENDIENTE',
    }
  });

  const oficio3 = await prisma.oficio.create({
    data: {
      procesoId: proceso3.id,
      numero: 'OFI-2024-003',
      destinatario: 'EPS Sanitas S.A.',
      destinatarioId: '830003567-2',
      tipoDestinatario: 'ENTIDAD_PUBLICA',
      direccion: 'Carrera 15 No. 75-20',
      email: 'judicial@sanitas.com.co',
      asunto: 'Requerimiento de Información - Tutela',
      contenido: 'En el trámite de la acción de tutela, se requiere información sobre la historia clínica y negativa de servicio...',
      estado: 'PENDIENTE',
    }
  });

  console.log('✅ Oficios creados: 3 oficios');

  // ==================== AUDIENCIAS ====================
  
  const audiencia1 = await prisma.audiencia.create({
    data: {
      procesoId: proceso4.id,
      juzgadoId: juzgado.id,
      tipo: 'INICIAL',
      fecha: new Date('2024-03-20T09:00:00'),
      duracion: 90,
      sala: 'Sala de Audiencias 301',
      juez: juez.nombre,
      secretario: secretario.nombre,
      estado: 'REALIZADA',
    }
  });

  const audiencia2 = await prisma.audiencia.create({
    data: {
      procesoId: proceso2.id,
      juzgadoId: juzgado.id,
      tipo: 'PRUEBAS',
      fecha: new Date('2024-04-15T14:00:00'),
      duracion: 120,
      sala: 'Sala de Audiencias 302',
      enlaceVirtual: 'https://teams.microsoft.com/l/meetup-join/...',
      juez: juez.nombre,
      secretario: secretario.nombre,
      estado: 'PROGRAMADA',
    }
  });

  console.log('✅ Audiencias creadas: 1 realizada, 1 programada');

  // ==================== TAREAS INTERNAS ====================
  
  // Tarea de Secretaría
  const tarea1 = await prisma.tarea.create({
    data: {
      procesoId: proceso1.id,
      titulo: 'Notificar auto admisorio al demandado',
      descripcion: 'Realizar notificación personal del auto admisorio al demandado Constructora El Progreso S.A.S.',
      tipo: TipoTarea.NOTIFICACION,
      prioridad: PrioridadTarea.ALTA,
      estado: EstadoTarea.PENDIENTE,
      area: AreaJuzgado.SECRETARIA,
      responsableId: escribiente1.id,
      creadoPorId: secretario.id,
      fechaLimite: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
    }
  });

  // Tarea de Despacho
  const tarea2 = await prisma.tarea.create({
    data: {
      procesoId: proceso2.id,
      titulo: 'Proyectar auto que decreta peritaje',
      descripcion: 'Proyectar auto que decreta la práctica de prueba pericial médica solicitada por la parte demandante.',
      tipo: TipoTarea.PROYECTAR_AUTO,
      prioridad: PrioridadTarea.MEDIA,
      estado: EstadoTarea.EN_PROGRESO,
      area: AreaJuzgado.DESPACHO,
      responsableId: oficialMayor1.id,
      creadoPorId: juez.id,
      fechaLimite: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
    }
  });

  // Tarea urgente de Tutela
  const tarea3 = await prisma.tarea.create({
    data: {
      procesoId: proceso3.id,
      titulo: 'TRÁMITE URGENTE - Practicar pruebas de oficio',
      descripcion: 'Tutela con término preferencial. Se deben practicar pruebas de oficio antes del vencimiento del término de 10 días.',
      tipo: TipoTarea.MEMORIAL,
      prioridad: PrioridadTarea.URGENTE,
      estado: EstadoTarea.PENDIENTE,
      area: AreaJuzgado.DESPACHO,
      responsableId: oficialMayor2.id,
      creadoPorId: secretario.id,
      fechaLimite: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      observaciones: 'Término de tutela corriendo. Máxima prioridad.',
    }
  });

  console.log('✅ Tareas creadas: 3 tareas asignadas');

  // ==================== TÉRMINOS PROCESALES ====================
  
  const termino1 = await prisma.termino.create({
    data: {
      procesoId: proceso1.id,
      tipo: 'Traslado demanda ejecutiva',
      descripcion: 'Término para contestar la demanda',
      fechaInicio: new Date('2024-01-18'),
      fechaVencimiento: new Date('2024-02-18'),
      diasTermino: 20,
      diasHabiles: true,
      completado: true,
      fechaCompletado: new Date('2024-02-15'),
    }
  });

  const termino2 = await prisma.termino.create({
    data: {
      procesoId: proceso2.id,
      tipo: 'Traslado interrogatorio de parte',
      descripcion: 'Término para responder interrogatorio de parte',
      fechaInicio: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      fechaVencimiento: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
      diasTermino: 15,
      diasHabiles: true,
      completado: false,
    }
  });

  const termino3 = await prisma.termino.create({
    data: {
      procesoId: proceso3.id,
      tipo: 'Término de tutela',
      descripcion: 'Término preferencial de 10 días para decidir',
      fechaInicio: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
      fechaVencimiento: new Date(Date.now() + 8 * 24 * 60 * 60 * 1000),
      diasTermino: 10,
      diasHabiles: false,  // Tutela cuenta días calendario
      completado: false,
    }
  });

  console.log('✅ Términos creados: 3 términos procesales');

  // ==================== PLANTILLAS POR ÁREA ====================
  
  // Plantillas de DESPACHO
  const plantillaAutoAdmisorio = await prisma.plantilla.upsert({
    where: { nombre: 'Auto Admisorio - Demanda Ordinaria' },
    create: {
      nombre: 'Auto Admisorio - Demanda Ordinaria',
      tipo: TipoDocumento.AUTO,
      area: AreaJuzgado.DESPACHO,
      contenido: `JUZGADO {{juzgado_nombre}}
{{juzgado_direccion}}

PROCESO: {{radicado}}
DEMANDANTE: {{demandante}}
DEMANDADO: {{demandado}}

AUTO ADMISORIO

Bogotá D.C., {{fecha}}

ASUNTO: Admisión de la demanda

Por medio del cual se admite la demanda presentada por {{demandante}} contra {{demandado}}.

CONSIDERACIONES:
{{consideraciones}}

RESUELVE:

PRIMERO. Admitir la demanda presentada por {{demandante}} contra {{demandado}}.

SEGUNDO. Correr traslado de la demanda al demandado por el término de {{termino_traslado}} días.

TERCERO. Notifíquese.

{{firma_juez}}
{{nombre_juez}}
Juez {{tipo_juzgado}}`,
      descripcion: 'Plantilla para auto admisorio de demanda ordinaria',
    },
    update: {},
  });

  const plantillaSentencia = await prisma.plantilla.upsert({
    where: { nombre: 'Sentencia Ordinaria' },
    create: {
      nombre: 'Sentencia Ordinaria',
      tipo: TipoDocumento.SENTENCIA,
      area: AreaJuzgado.DESPACHO,
      contenido: `SENTENCIA No. {{numero_sentencia}}

JUZGADO {{juzgado_nombre}}

PROCESO: {{radicado}}
CLASE: {{clase_proceso}}
DEMANDANTE: {{demandante}}
DEMANDADO: {{demandado}}
CUANTÍA: {{cuantia}}

Bogotá D.C., {{fecha}}

I. ANTECEDENTES
{{antecedentes}}

II. CONSIDERACIONES
{{consideraciones}}

III. FUNDAMENTOS DE DERECHO
{{fundamentos}}

IV. RESUELVE

PRIMERO. {{resolutivo_primero}}

SEGUNDO. {{resolutivo_segundo}}

TERCERO. No se condena en costas.

CUARTO. Notifíquese y archívese.

{{firma_juez}}
{{nombre_juez}}
Juez {{tipo_juzgado}}

SECRETARIO`,
      descripcion: 'Plantilla para sentencia de proceso ordinario',
    },
    update: {},
  });

  // Plantillas de SECRETARÍA
  const plantillaOficio = await prisma.plantilla.upsert({
    where: { nombre: 'Oficio General' },
    create: {
      nombre: 'Oficio General',
      tipo: TipoDocumento.OFICIO,
      area: AreaJuzgado.SECRETARIA,
      contenido: `{{juzgado_nombre}}
{{juzgado_direccion}}
Tel: {{juzgado_telefono}}
Email: {{juzgado_email}}

OFICIO No. {{numero_oficio}}

Bogotá D.C., {{fecha}}

Señores
{{destinatario}}
{{direccion_destinatario}}
Ciudad

Asunto: {{asunto}}

Reciba un cordial saludo. En el proceso de la referencia, me permito solicitar:

{{contenido}}

Atentamente,

{{firma_secretario}}
{{nombre_secretario}}
Secretario {{tipo_juzgado}}

Rad.: {{radicado}}`,
      descripcion: 'Plantilla para oficios generales',
    },
    update: {},
  });

  const plantillaConstancia = await prisma.plantilla.upsert({
    where: { nombre: 'Constancia Secretarial' },
    create: {
      nombre: 'Constancia Secretarial',
      tipo: TipoDocumento.CONSTANCIA,
      area: AreaJuzgado.SECRETARIA,
      contenido: `CONSTANCIA

El suscrito Secretario del {{juzgado_nombre}}, en cumplimiento de sus funciones legales, hace constar:

{{contenido_constancia}}

Se expide a los {{dia}} días del mes de {{mes}} de {{anio}}, a solicitud de la parte interesada.

{{firma_secretario}}
{{nombre_secretario}}
Secretario {{tipo_juzgado}}`,
      descripcion: 'Plantilla para constancias secretaryales',
    },
    update: {},
  });

  const plantillaAvisoNotificacion = await prisma.plantilla.upsert({
    where: { nombre: 'Aviso de Notificación Personal - Art. 293 CGP' },
    create: {
      nombre: 'Aviso de Notificación Personal - Art. 293 CGP',
      tipo: TipoDocumento.AVISO_NOTIFICACION,
      area: AreaJuzgado.SECRETARIA,
      contenido: `AVISO DE NOTIFICACIÓN PERSONAL
(Artículo 293 C.G.P.)

JUZGADO {{juzgado_nombre}}

PROCESO: {{radicado}}
DEMANDANTE: {{demandante}}
DEMANDADO: {{demandado}}

Señor(a)
{{destinatario}}
{{direccion_destinatario}}

Por medio del presente aviso, se le notifica que en el proceso de la referencia se profirió:

{{providencia_notificar}}

Fecha de la providencia: {{fecha_providencia}}

Se le concede un término de OCHO (8) días siguientes a la notificación del presente aviso para que comparezca al Despacho a notificarse personalmente del auto mencionado, o para que manifieste que conoce la providencia y se notifique de ella.

Se advierte que si no comparece, se procederá a designar curador ad litem para que lo represente en el proceso.

El presente aviso se entregará a la persona que se encuentre en el lugar de notificación, o se fijará en la puerta de acceso del mismo.

Se expide en Bogotá D.C., a los {{dia}} días del mes de {{mes}} de {{anio}}.

{{firma_secretario}}
{{nombre_secretario}}
Secretario {{tipo_juzgado}}`,
      descripcion: 'Plantilla para aviso de notificación personal según CGP',
    },
    update: {},
  });

  const plantillaEstado = await prisma.plantilla.upsert({
    where: { nombre: 'Estado del Juzgado' },
    create: {
      nombre: 'Estado del Juzgado',
      tipo: TipoDocumento.ESTADO_JUZGADO,
      area: AreaJuzgado.SECRETARIA,
      contenido: `ESTADO DEL JUZGADO
{{juzgado_nombre}}
{{juzgado_direccion}}

FECHA: {{fecha}}

AUTO No. {{numero_auto}}    FECHA: {{fecha_auto}}

PROCESO: {{radicado}}
PARTE ACTIVA: {{demandante}}
PARTE PASIVA: {{demandado}}

PROVIDENCIA:
{{providencia}}

Se advierte que esta notificación se entenderá surtida transcurridos tres (3) días siguientes a la inserción del presente estado.

{{firma_secretario}}
{{nombre_secretario}}
Secretario {{tipo_juzgado}}`,
      descripcion: 'Plantilla para estado del juzgado',
    },
    update: {},
  });

  console.log('✅ Plantillas creadas:');
  console.log('   DESPACHO: Auto Admisorio, Sentencia');
  console.log('   SECRETARÍA: Oficio, Constancia, Aviso Notificación, Estado');

  // ==================== NOTIFICACIONES DE SISTEMA ====================
  
  await prisma.notificacionSistema.create({
    data: {
      tipo: 'TERMINO_POR_VENCER',
      titulo: 'Término por vencer',
      mensaje: `El término de tutela del proceso ${proceso3.radicado} vence en 8 días.`,
      procesoId: proceso3.id,
      usuarioId: juez.id,
    }
  });

  await prisma.notificacionSistema.create({
    data: {
      tipo: 'NUEVA_PROVIDENCIA',
      titulo: 'Nueva providencia para firma',
      mensaje: `El auto de práctica de pruebas del proceso ${proceso2.radicado} está pendiente de firma.`,
      procesoId: proceso2.id,
      usuarioId: juez.id,
    }
  });

  await prisma.notificacionSistema.create({
    data: {
      tipo: 'NUEVA_TAREA',
      titulo: 'Nueva tarea asignada',
      mensaje: 'Se le ha asignado una tarea urgente en el proceso de tutela.',
      procesoId: proceso3.id,
      usuarioId: oficialMayor2.id,
    }
  });

  console.log('✅ Notificaciones de sistema creadas');

  console.log('\n🎉 Seed completado exitosamente!');
  console.log('\n📊 RESUMEN:');
  console.log('├── Juzgado: 1');
  console.log('├── Usuarios: 8 (Despacho: 3, Secretaría: 4, Super Admin: 1)');
  console.log('├── Procesos: 40 (30 civiles + 10 tutelas, primera instancia - radicado termina en 00)');
  console.log('├── Providencias: 4 (Autos: 3, Sentencias: 1)');
  console.log('├── Memoriales: 3');
  console.log('├── Oficios: 3');
  console.log('├── Audiencias: 2');
  console.log('├── Tareas: 3');
  console.log('├── Términos: 3');
  console.log('└── Plantillas: 6 (Despacho: 2, Secretaría: 4)');
}

main()
  .catch((e) => {
    console.error('❌ Error en seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
