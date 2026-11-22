import { supabase } from "../config/supabase.js";

// Catalogos para los selects del registro
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

// Verifica que el usuario no exista en ninguna de las 3 tablas de actores ni el RFC esté duplicado
export async function verificarDuplicadosRegistro(usuario, rfc) {
  const [adminRes, consRes, mipymeRes, rfcRes] = await Promise.all([
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
    supabase
      .from("existencia_fiscal")
      .select("id_existencia_fiscal")
      .eq("rfc", rfc)
      .maybeSingle(),
  ]);

  if (adminRes.data || consRes.data || mipymeRes.data) {
    return {
      duplicado: true,
      campo: "usuario",
      mensaje: "Ese nombre de usuario ya está ocupado en WorkGuard.",
    };
  }
  if (rfcRes.data) {
    return {
      duplicado: true,
      campo: "rfc",
      mensaje: "Ese RFC ya se encuentra registrado en WorkGuard.",
    };
  }
  return { duplicado: false };
}

// Crear Empresa en la base con Rollback si falla algún paso
export async function crearRegistroMipymeCompleto(datos) {
    let idDomFiscal = null;
    let idExistencia = null;
    let idDomOp = null;
    let idActividad = null;
    let idRepresentante = null;

    try {
        // Domicilio_fiscal
        const { data: domFiscal, error: errDomF } = await supabase
            .from('domicilio_fiscal')
            .insert([{
                codigo_postal: datos.domicilio_fiscal.codigo_postal,
                calle: datos.domicilio_fiscal.calle,
                numero: datos.domicilio_fiscal.numero,
                id_alcaldia_fiscal: Number(datos.domicilio_fiscal.id_alcaldia_fiscal),
                id_entidad_federativa_fiscal: Number(datos.domicilio_fiscal.id_entidad_federativa_fiscal)
            }])
            .select('id_domicilio_fiscal')
            .single();
        if (errDomF) throw errDomF;
        idDomFiscal = domFiscal.id_domicilio_fiscal;

        // Existencia_fiscal
        const { data: existencia, error: errEx } = await supabase
            .from('existencia_fiscal')
            .insert([{
                nombre_comercial: datos.nombre_comercial,
                representante_legal: datos.representante.nombre_completo,
                rfc: datos.rfc,
                id_giro: Number(datos.id_giro),
                id_domicilio_fiscal: idDomFiscal
            }])
            .select('id_existencia_fiscal')
            .single();
        if (errEx) throw errEx;
        idExistencia = existencia.id_existencia_fiscal;

        // Domicilio_operaciones
        const { data: domOp, error: errDomOp } = await supabase
            .from('domicilio_operaciones')
            .insert([{
                codigo_postal: datos.domicilio_operaciones.codigo_postal,
                calle: datos.domicilio_operaciones.calle,
                numero: datos.domicilio_operaciones.numero,
                id_alcaldia_operaciones: Number(datos.domicilio_operaciones.id_alcaldia_operaciones),
                id_entidad_federativa_operaciones: Number(datos.domicilio_operaciones.id_entidad_federativa_operaciones)
            }])
            .select('id_domicilio_operaciones')
            .single();
        if (errDomOp) throw errDomOp;
        idDomOp = domOp.id_domicilio_operaciones;

        // Actividad (redes y web)
        const { data: actividad, error: errAct } = await supabase
            .from('actividad')
            .insert([{
                facebook: datos.actividad.facebook || null,
                instagram: datos.actividad.instagram || null,
                twitter: datos.actividad.twitter || null,
                pagina_web: datos.actividad.pagina_web || null
            }])
            .select('id_actividad')
            .single();
        if (errAct) throw errAct;
        idActividad = actividad.id_actividad;

        // Representante
        const { data: representante, error: errRep } = await supabase
            .from('representante')
            .insert([{
                nombre_completo: datos.representante.nombre_completo,
                curp: datos.representante.curp,
                id_tarjeta: null
            }])
            .select('id_representante')
            .single();
        if (errRep) throw errRep;
        idRepresentante = representante.id_representante;

        // Mipyme principal con su dictamen_verificacion
        const { data: nuevaMipyme, error: errMipyme } = await supabase
            .from('mipyme')
            .insert([{
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
                dictamen_verificacion: datos.dictamen_verificacion
            }])
            .select('id_mipyme, nombre_comercial, usuario, tipo_persona, dictamen_verificacion')
            .single();
        if (errMipyme) throw errMipyme;

        return nuevaMipyme;
    } catch (error) {
        // Rollback para no dejar registros si falla algo
        if (idRepresentante) await supabase.from('representante').delete().eq('id_representante', idRepresentante);
        if (idActividad) await supabase.from('actividad').delete().eq('id_actividad', idActividad);
        if (idDomOp) await supabase.from('domicilio_operaciones').delete().eq('id_domicilio_operaciones', idDomOp);
        if (idExistencia) await supabase.from('existencia_fiscal').delete().eq('id_existencia_fiscal', idExistencia);
        if (idDomFiscal) await supabase.from('domicilio_fiscal').delete().eq('id_domicilio_fiscal', idDomFiscal);
        throw error;
    }
}


// Listar las MiPymes ya verificadas al CONSULTOR
export async function listarMipymesAprobadas() {
  const { data, error } = await supabase
    .from("mipyme")
    .select(
      `
            id_mipyme,
            nombre_comercial,
            tipo_persona,
            numero_trabajadores,
            dictamen_verificacion,
            existencia_fiscal ( rfc, catalogo_giro ( opcion_giro ) ),
            domicilio_operaciones ( calle, numero, codigo_postal, catalogo_alcaldia_operaciones ( opcion_alcaldia ) ),
            catalogo_tamano ( opcion_tamano_empresa ),
            actividad ( pagina_web, facebook, instagram, twitter )
        `,
    )
    .order("id_mipyme", { ascending: false });

  if (error) throw error;

  return (data || []).filter(
    (m) => m.dictamen_verificacion?.sello_aprobado === true,
  );
}

// Listar la MiPymes al ADMINISTRADOR para revision
export async function listarMipymesParaAdmin() {
  const { data, error } = await supabase
    .from("mipyme")
    .select(
      `
            id_mipyme,
            nombre_comercial,
            usuario,
            tipo_persona,
            numero_trabajadores,
            dictamen_verificacion,
            existencia_fiscal ( rfc, representante_legal, catalogo_giro ( opcion_giro ) ),
            domicilio_operaciones ( calle, numero, codigo_postal, catalogo_alcaldia_operaciones ( opcion_alcaldia ) ),
            catalogo_tamano ( opcion_tamano_empresa ),
            representante ( nombre_completo )
        `,
    )
    .order("id_mipyme", { ascending: false });

  if (error) throw error;
  return data || [];
}

// Detalle de MiPyme
export async function obtenerMipymePorId(idMipyme) {
  const { data, error } = await supabase
    .from("mipyme")
    .select(
      `
            id_mipyme,
            nombre_comercial,
            usuario,
            tipo_persona,
            numero_trabajadores,
            dictamen_verificacion,
            existencia_fiscal (
                rfc,
                representante_legal,
                catalogo_giro ( opcion_giro ),
                domicilio_fiscal ( calle, numero, codigo_postal, catalogo_alcaldia_fiscal ( opcion_alcaldia ) )
            ),
            domicilio_operaciones (
                calle,
                numero,
                codigo_postal,
                catalogo_alcaldia_operaciones ( opcion_alcaldia )
            ),
            catalogo_tamano ( opcion_tamano_empresa ),
            actividad ( pagina_web, facebook, instagram, twitter )
        `,
    )
    .eq("id_mipyme", idMipyme)
    .maybeSingle();

  if (error) throw error;
  return data;
}

// Aprobar una MiPyme e insertar MOtivo en caso de no aprobarla
export async function actualizarDictamenAdmin(
  idMipyme,
  { aprobar, motivo_rechazo },
) {
  const actual = await obtenerMipymePorId(idMipyme);
  if (!actual) return null;

  const dictamenPrevio = actual.dictamen_verificacion || { pasos: {} };

  const nuevoDictamen = aprobar
    ? {
        ...dictamenPrevio,
        estatus: "VERIFICADA",
        sello_aprobado: true,
        motivo_rechazo: null,
        mensaje_pyme:
          "¡Felicidades! Tu empresa ha sido aprobada por el equipo de WorkGuard y ya es visible con Sello de Verificación para los consultores.",
        fecha_dictamen: new Date().toISOString(),
      }
    : {
        ...dictamenPrevio,
        estatus: "RECHAZADA",
        sello_aprobado: false,
        motivo_rechazo:
          motivo_rechazo ||
          "Documentación o datos inconsistentes tras revisión administrativa.",
        mensaje_pyme: `Tu solicitud fue rechazada por el administrador. Motivo: ${motivo_rechazo}`,
        fecha_dictamen: new Date().toISOString(),
      };
  const { data, error } = await supabase
    .from("mipyme")
    .update({ dictamen_verificacion: nuevoDictamen })
    .eq("id_mipyme", idMipyme)
    .select("id_mipyme, nombre_comercial, dictamen_verificacion")
    .single();
  if (error) throw error;
  return data;
}
