import { supabase } from "../config/supabase.js";

//Catalogos necesarios para selects
export async function obtenerCatalogosRegistro() {
  const [
    giros,
    alcaldiasFiscal,
    entidadesFiscal,
    alcaldiasOp,
    entidadesOp,
    tamanos,
  ] = await Promise.all([
    supabase.from("catalogo_giro").select("*").order("id_giro"),
    supabase
      .from("catalogo_alcaldia_fiscal")
      .select("*")
      .order("id_alcaldia_fiscal"),
    supabase
      .from("catalogo_entidad_federativa_fiscal")
      .select("*")
      .order("id_entidad_federativa_fiscal"),
    supabase
      .from("catalogo_alcaldia_operaciones")
      .select("*")
      .order("id_alcaldia_operaciones"),
    supabase
      .from("catalogo_entidad_operaciones")
      .select("*")
      .order("id_entidad_federativa_operaciones"),
    supabase.from("catalogo_tamano").select("*").order("id_catalogo_tamano"),
  ]);

  if (giros.error) throw giros.error;
  if (alcaldiasFiscal.error) throw alcaldiasFiscal.error;
  if (entidadesFiscal.error) throw entidadesFiscal.error;
  if (alcaldiasOp.error) throw alcaldiasOp.error;
  if (entidadesOp.error) throw entidadesOp.error;
  if (tamanos.error) throw tamanos.error;

  return {
    giros: giros.data,
    alcaldias_fiscal: alcaldiasFiscal.data,
    entidades_fiscal: entidadesFiscal.data,
    alcaldias_operaciones: alcaldiasOp.data,
    entidades_operaciones: entidadesOp.data,
    tamanos: tamanos.data,
  };
}

//Obitene el id para el tamaño de la empresa
export async function obtenerIdTamanoPorEtiqueta(etiquetaDof) {
  const { data, error } = await supabase
    .from("catalogo_tamano")
    .select("id_catalogo_tamano, opcion_tamano_empresa");

  if (error) throw error;
  if (!data || data.length === 0) return null;

  const palabraClave = etiquetaDof.toLowerCase(); // 'micro', 'pequeña', 'mediana'
  const encontrado = data.find((t) =>
    t.opcion_tamano_empresa.toLowerCase().includes(palabraClave),
  );
  return encontrado
    ? encontrado.id_catalogo_tamano
    : data[0].id_catalogo_tamano;
}

//Verifica duplicados de RFC y Nombre 
export async function verificarDuplicadosPaso1(rfc, nombreComercial) {
  const [rfcRes, nombreRes] = await Promise.all([
    supabase
      .from("existencia_fiscal")
      .select("id_existencia_fiscal")
      .eq("rfc", rfc)
      .maybeSingle(),
    supabase
      .from("mipyme")
      .select("id_mipyme")
      .ilike("nombre_comercial", nombreComercial)
      .maybeSingle(),
  ]);

  if (rfcRes.error) throw rfcRes.error;
  if (nombreRes.error) throw nombreRes.error;

  return {
    existeRfc: Boolean(rfcRes.data),
    existeNombre: Boolean(nombreRes.data),
  };
}


//Verifica que la CURP no esté registrada ya en otro representante//
export async function verificarCurpDuplicada(curp) {
  const { data, error } = await supabase
    .from("representante")
    .select("id_representante")
    .eq("curp", curp)
    .maybeSingle();

  if (error) throw error;
  return Boolean(data);
}

//Verifica la duplicacion del usuario
export async function verificarUsuarioDuplicado(usuario) {
  const [adminRes, consRes, mipymeRes] = await Promise.all([
    supabase
      .from("administrador")
      .select("id_administrador")
      .eq("usuario", usuario)
      .maybeSingle(),
    supabase
      .from("consultor")
      .select("id_consultor")
      .eq("usuario", usuario)
      .maybeSingle(),
    supabase
      .from("mipyme")
      .select("id_mipyme")
      .eq("usuario", usuario)
      .maybeSingle(),
  ]);

  return Boolean(adminRes.data || consRes.data || mipymeRes.data);
}

//Consulta las listas negras
export async function verificarListasNegras({
  rfc = "",
  curp = "",
  nombreComercial = "",
}) {
  if (rfc) {
    const { data: efosData, error: efosErr } = await supabase
      .from("lista_negra_sat_efos")
      .select("rfc, nombre_contribuyente, situacion")
      .eq("rfc", rfc)
      .maybeSingle();

    if (efosErr) throw efosErr;
    if (efosData) {
      return {
        enListaNegra: true,
        motivo: `El RFC ${efosData.rfc} figura en el listado oficial del SAT (Art. 69-B EFOS - Situación: ${efosData.situacion}).`,
      };
    }
  }

  // Revisar sanciones activas en listado_negro interno
  const { data: sancionados, error: sancErr } = await supabase
    .from("listado_negro")
    .select(
      `
      id_listado,
      motivo_inclusion,
      estado,
      mipyme (
        nombre_comercial,
        existencia_fiscal ( rfc ),
        representante ( curp )
      )
    `,
    )
    .eq("estado", "ACTIVA");

  if (sancErr) throw sancErr;

  for (const item of sancionados || []) {
    const m = item.mipyme;
    if (!m) continue;
    const rfcBloqueado = m.existencia_fiscal?.rfc?.toUpperCase();
    const curpBloqueada = m.representante?.curp?.toUpperCase();
    const nombreBloqueado = m.nombre_comercial?.toLowerCase().trim();

    if (rfc && rfcBloqueado === rfc) {
      return {
        enListaNegra: true,
        motivo: `El RFC se encuentra sancionado en el Listado Negro de WorkGuard: ${item.motivo_inclusion}`,
      };
    }
    if (curp && curpBloqueada === curp) {
      return {
        enListaNegra: true,
        motivo: `La CURP del representante está vinculada a una empresa sancionada en el Listado Negro de WorkGuard.`,
      };
    }
    if (
      nombreComercial &&
      nombreBloqueado === nombreComercial.toLowerCase().trim()
    ) {
      return {
        enListaNegra: true,
        motivo: `El Nombre Comercial está vinculado a un registro activo en el Listado Negro de WorkGuard.`,
      };
    }
  }

  return { enListaNegra: false };
}

//Verifica que no haya intentado registrarse antes
export async function obtenerIntentosRegistro(rfc, curp = "") {
  if (rfc) {
    const { data, error } = await supabase
      .from("intentos_registro_mipyme")
      .select("*")
      .eq("rfc", rfc)
      .maybeSingle();
    if (error) throw error;
    if (data) return data;
  }

  if (curp) {
    const { data, error } = await supabase
      .from("intentos_registro_mipyme")
      .select("*")
      .eq("curp", curp)
      .maybeSingle();
    if (error) throw error;
    if (data) return data;
  }

  return null;
}

//Registra los fallos para futuros registros
export async function registrarFalloIntento({
  rfc,
  curp = null,
  nombreComercial = null,
  paso,
  esRojo = false,
  motivo = "",
}) {
  const columnaPaso = `naranja_paso${paso}`;
  const actual = await obtenerIntentosRegistro(rfc, curp);

  const nuevosConteos = {
    naranja_paso1: actual?.naranja_paso1 || 0,
    naranja_paso2: actual?.naranja_paso2 || 0,
    naranja_paso3: actual?.naranja_paso3 || 0,
    naranja_paso4: actual?.naranja_paso4 || 0,
  };

  if (!esRojo) {
    nuevosConteos[columnaPaso] += 1;
  }

  const intentosPasoActual = nuevosConteos[columnaPaso];
  const bloqueado = Boolean(
    actual?.bloqueado || esRojo || intentosPasoActual >= 3,
  );
  const motivoFinal = bloqueado
    ? esRojo
      ? motivo
      : `Límite de 3 intentos fallidos alcanzado en el Paso ${paso}. Último error: ${motivo}`
    : null;

  const payload = {
    rfc,
    curp: curp || actual?.curp || null,
    nombre_comercial: nombreComercial || actual?.nombre_comercial || null,
    ...nuevosConteos,
    bloqueado,
    motivo_bloqueo: motivoFinal,
    fecha_actualizacion: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("intentos_registro_mipyme")
    .upsert(payload, { onConflict: "rfc" });

  if (error) throw error;

  return {
    intentosUsados: intentosPasoActual,
    intentosRestantes: Math.max(0, 3 - intentosPasoActual),
    bloqueado,
    motivoBloqueo: motivoFinal,
  };
}


export async function limpiarIntentosRegistro(rfc) {
  if (!rfc) return;
  await supabase.from("intentos_registro_mipyme").delete().eq("rfc", rfc);
}

//Crea la pyme con rollback por si algo falla
export async function crearRegistroMipymeCompleto(datos) {
  let idDomFiscal = null;
  let idExistencia = null;
  let idDomOp = null;
  let idActividad = null;
  let idRepresentante = null;

  try {
    // Domicilio Fiscal
    const { data: domFiscal, error: errDomF } = await supabase
      .from("domicilio_fiscal")
      .insert([
        {
          codigo_postal: datos.domicilio_fiscal.codigo_postal,
          calle: datos.domicilio_fiscal.calle,
          numero: datos.domicilio_fiscal.numero,
          id_alcaldia_fiscal: Number(datos.domicilio_fiscal.id_alcaldia_fiscal),
          id_entidad_federativa_fiscal: Number(
            datos.domicilio_fiscal.id_entidad_federativa_fiscal,
          ),
        },
      ])
      .select("id_domicilio_fiscal")
      .single();
    if (errDomF) throw errDomF;
    idDomFiscal = domFiscal.id_domicilio_fiscal;

    //Existencia Fiscal
    const { data: existencia, error: errEx } = await supabase
      .from("existencia_fiscal")
      .insert([
        {
          nombre_comercial: datos.nombre_comercial,
          representante_legal: datos.representante.nombre_completo,
          rfc: datos.rfc,
          id_giro: Number(datos.id_giro),
          id_domicilio_fiscal: idDomFiscal,
        },
      ])
      .select("id_existencia_fiscal")
      .single();
    if (errEx) throw errEx;
    idExistencia = existencia.id_existencia_fiscal;

    // Domicilio de Operaciones
    const { data: domOp, error: errDomOp } = await supabase
      .from("domicilio_operaciones")
      .insert([
        {
          codigo_postal: datos.domicilio_operaciones.codigo_postal,
          calle: datos.domicilio_operaciones.calle,
          numero: datos.domicilio_operaciones.numero,
          id_alcaldia_operaciones: Number(
            datos.domicilio_operaciones.id_alcaldia_operaciones,
          ),
          id_entidad_federativa_operaciones: Number(
            datos.domicilio_operaciones.id_entidad_federativa_operaciones,
          ),
        },
      ])
      .select("id_domicilio_operaciones")
      .single();
    if (errDomOp) throw errDomOp;
    idDomOp = domOp.id_domicilio_operaciones;
    // Actividad (Redes sociales y sitio web opcionales)
    const { data: actividad, error: errAct } = await supabase
      .from("actividad")
      .insert([
        {
          facebook: datos.actividad.facebook || null,
          instagram: datos.actividad.instagram || null,
          twitter: datos.actividad.twitter || null,
          pagina_web: datos.actividad.pagina_web || null,
        },
      ])
      .select("id_actividad")
      .single();
    if (errAct) throw errAct;
    idActividad = actividad.id_actividad;
    //Representante Legal / Titular
    const { data: representante, error: errRep } = await supabase
      .from("representante")
      .insert([
        {
          nombre_completo: datos.representante.nombre_completo,
          curp: datos.representante.curp,
          id_tarjeta: null,
        },
      ])
      .select("id_representante")
      .single();
    if (errRep) throw errRep;
    idRepresentante = representante.id_representante;
    //Tabla principal mipyme (Sello WorkGuard activo automáticamente al existir en esta tabla)
    const { data: nuevaMipyme, error: errMipyme } = await supabase
      .from("mipyme")
      .insert([
        {
          nombre_comercial: datos.nombre_comercial,
          usuario: datos.usuario,
          contrasena: datos.contrasena_hash,
          tipo_persona: datos.tipo_persona,
          numero_trabajadores: Number(datos.numero_trabajadores),
          id_existencia_fiscal: idExistencia,
          id_actividad: idActividad,
          id_domicilio_operaciones: idDomOp,
          id_representante: idRepresentante,
          id_tamano: Number(datos.id_tamano),
          validado_denue: Boolean(datos.validado_denue),
        },
      ])
      .select(
        "id_mipyme, nombre_comercial, usuario, tipo_persona, validado_denue",
      )
      .single();
    if (errMipyme) throw errMipyme;
    return nuevaMipyme;
  } catch (error) {
    // Rollback limpio si falla algún paso de inserción
    if (idRepresentante)
      await supabase
        .from("representante")
        .delete()
        .eq("id_representante", idRepresentante);
    if (idActividad)
      await supabase.from("actividad").delete().eq("id_actividad", idActividad);
    if (idDomOp)
      await supabase
        .from("domicilio_operaciones")
        .delete()
        .eq("id_domicilio_operaciones", idDomOp);
    if (idExistencia)
      await supabase
        .from("existencia_fiscal")
        .delete()
        .eq("id_existencia_fiscal", idExistencia);
    if (idDomFiscal)
      await supabase
        .from("domicilio_fiscal")
        .delete()
        .eq("id_domicilio_fiscal", idDomFiscal);
    throw error;
  }
}


//Lista las mipymes que no esten en la lista negra
export async function listarMipymesAprobadas() {
  const [mipymesRes, sancionadasRes] = await Promise.all([
    supabase
      .from('mipyme')
      .select(
        'id_mipyme, nombre_comercial, tipo_persona, numero_trabajadores, validado_denue, ' +
        'existencia_fiscal ( rfc, catalogo_giro ( opcion_giro ) ), ' +
        'domicilio_operaciones ( calle, numero, codigo_postal, catalogo_alcaldia_operaciones ( opcion_alcaldia ) ), ' +
        'catalogo_tamano ( opcion_tamano_empresa ), ' +
        'actividad ( pagina_web, facebook, instagram, twitter )'
      )
      .order('id_mipyme', { ascending: false }),
    supabase
      .from('listado_negro')
      .select('id_mipyme')
      .eq('estado', 'ACTIVA')
  ]);

  if (mipymesRes.error) throw mipymesRes.error;
  if (sancionadasRes.error) throw sancionadasRes.error;

  const idsSancionadas = new Set((sancionadasRes.data || []).map((s) => s.id_mipyme));
  return (mipymesRes.data || []).filter((m) => !idsSancionadas.has(m.id_mipyme));
}


//Detalle de la empresa
export async function obtenerMipymePorId(idMipyme) {
  const { data, error } = await supabase
    .from("mipyme")
    .select(
      "id_mipyme, nombre_comercial, usuario, tipo_persona, numero_trabajadores, validado_denue, " +
      "existencia_fiscal(rfc, representante_legal, catalogo_giro(opcion_giro), domicilio_fiscal(calle, numero, codigo_postal, catalogo_alcaldia_fiscal(opcion_alcaldia))), " +
      "domicilio_operaciones(calle, numero, codigo_postal, catalogo_alcaldia_operaciones(opcion_alcaldia)), " +
      "catalogo_tamano(opcion_tamano_empresa), " +
      "representante(nombre_completo, curp), " +
      "actividad(pagina_web, facebook, instagram, twitter)"
    )
    .eq("id_mipyme", idMipyme)
    .maybeSingle();

  if (error) throw error;
  return data;
}
