import { randomUUID } from 'node:crypto';
import { supabase } from '../config/supabase.js';

const LIMITE_LISTA = 200;
const BUCKET_REPORTES = 'evidencias-reportes';


// Convierte las fechas almacenadas en UTC.
function comoUTC(valor) {

    if (!valor) return null;

    return /([zZ]|[+-]\d{2}:?\d{2})$/.test(valor)
        ? valor
        : valor + 'Z';
}


// CREAR REPORTE Y GUARDAR SU EVIDENCIA.
export async function crearReporte({
    idMipyme,
    idConsultor,
    motivo,
    otroMotivo,
    descripcion,
    archivo
}) {

    let idReporte = null;
    let rutaArchivo = null;

    try {

        // 1. INSERTAR EL REPORTE.
        const { data: reporte, error: errorReporte } = await supabase
            .from('reportes')
            .insert([{
                id_mipyme: idMipyme,
                id_consultor: idConsultor,
                motivo,
                otro_motivo: otroMotivo,
                descripcion
            }])
            .select('id_reporte')
            .single();

        if (errorReporte) throw errorReporte;

        idReporte = reporte.id_reporte;


        // 2. CREAR UNA RUTA PARA EL PDF.
        const nombreSeguro = `${randomUUID()}.pdf`;

        rutaArchivo = `${idReporte}/${nombreSeguro}`;


        // 3. SUBIR EL PDF A SUPABASE STORAGE.
        const { error: errorStorage } = await supabase
            .storage
            .from(BUCKET_REPORTES)
            .upload(rutaArchivo, archivo.buffer, {
                contentType: 'application/pdf',
                upsert: false
            });

        if (errorStorage) throw errorStorage;


        // 4. REGISTRAR LOS DATOS DEL ARCHIVO.
        const { error: errorArchivo } = await supabase
            .from('archivos_reporte')
            .insert([{
                id_reporte: idReporte,
                nombre_archivo: archivo.originalname,
                ruta_archivo: rutaArchivo,
                tipo_archivo: 'application/pdf'
            }]);

        if (errorArchivo) throw errorArchivo;


        // 5. DEVOLVER EL ID DEL REPORTE.
        return idReporte;

    } catch (error) {

        // Si algo falla, intentamos eliminar los archivos
        // y el reporte incompleto para evitar registros huérfanos.

        if (rutaArchivo) {

            const { error: errorEliminarArchivo } = await supabase
                .storage
                .from(BUCKET_REPORTES)
                .remove([rutaArchivo]);

            if (errorEliminarArchivo) {
                console.error(
                    'No se pudo eliminar el PDF:',
                    errorEliminarArchivo
                );
            }
        }

        if (idReporte !== null) {

            const { error: errorEliminarReporte } = await supabase
                .from('reportes')
                .delete()
                .eq('id_reporte', idReporte);

            if (errorEliminarReporte) {
                console.error(
                    'No se pudo eliminar el reporte incompleto:',
                    errorEliminarReporte
                );
            }
        }

        throw error;
    }
}


// COLUMNAS UTILIZADAS PARA LISTAR LOS REPORTES.
const COLUMNAS_LISTA =
    'id_reporte, id_consultor, motivo, descripcion, estado, fecha_reporte, consultor(usuario, foto_perfil), mipyme(nombre_comercial)';


// ORGANIZAR LOS DATOS DE CADA REPORTE.
function aplanarLista(r) {

    return {
        id_reporte: r.id_reporte,
        id_consultor: r.id_consultor,
        motivo: r.motivo,
        descripcion: r.descripcion,
        estado: r.estado,
        fecha_reporte: comoUTC(r.fecha_reporte),

        consultor_usuario: r.consultor?.usuario,
        consultor_foto: r.consultor?.foto_perfil,

        nombre_comercial: r.mipyme?.nombre_comercial
    };
}


// LISTAR REPORTES.
export async function listarReportes() {

    const pendientes = await supabase
        .from('reportes')
        .select(COLUMNAS_LISTA)
        .eq('estado', 'PENDIENTE')
        .order('fecha_reporte', { ascending: false });

    if (pendientes.error) throw pendientes.error;

    let otros = [];

    const restantes = LIMITE_LISTA - pendientes.data.length;

    if (restantes > 0) {

        const resto = await supabase
            .from('reportes')
            .select(COLUMNAS_LISTA)
            .neq('estado', 'PENDIENTE')
            .order('fecha_reporte', { ascending: false })
            .limit(restantes);

        if (resto.error) throw resto.error;

        otros = resto.data;
    }

    return [
        ...pendientes.data,
        ...otros
    ].map(aplanarLista);
}


// OBTENER UN REPORTE COMPLETO.
export async function obtenerReportePorId(idReporte) {

    const { data, error } = await supabase
        .from('reportes')
        .select(`
            id_reporte,
            id_mipyme,
            id_consultor,
            motivo,
            otro_motivo,
            descripcion,
            estado,
            id_administrador,
            fecha_reporte,
            fecha_revision,
            consultor(
                usuario,
                nombre_completo,
                correo_electronico,
                foto_perfil
            ),
            mipyme(
                nombre_comercial,
                tipo_persona,
                numero_trabajadores
            )
        `)
        .eq('id_reporte', idReporte)
        .maybeSingle();

    if (error) throw error;

    if (!data) return null;

    // Buscar evidencias PDF asociadas al reporte
    const { data: archivos, error: errorArchivos } = await supabase
        .from('archivos_reporte')
        .select('id_archivo, nombre_archivo, ruta_archivo, tipo_archivo, fecha_subida')
        .eq('id_reporte', idReporte);

    if (errorArchivos) throw errorArchivos;

    const evidencias = await Promise.all(
        (archivos || []).map(async (arch) => {
            const { data: signed } = await supabase
                .storage
                .from(BUCKET_REPORTES)
                .createSignedUrl(arch.ruta_archivo, 60 * 60); // URL válida 1 hora

            return {
                id_archivo: arch.id_archivo,
                nombre_archivo: arch.nombre_archivo,
                tipo_archivo: arch.tipo_archivo,
                fecha_subida: comoUTC(arch.fecha_subida),
                url: signed?.signedUrl || null
            };
        })
    );

    return {
        id_reporte: data.id_reporte,
        id_mipyme: data.id_mipyme,
        id_consultor: data.id_consultor,

        motivo: data.motivo,
        otro_motivo: data.otro_motivo,
        descripcion: data.descripcion,

        estado: data.estado,
        id_administrador: data.id_administrador,

        fecha_reporte: comoUTC(data.fecha_reporte),
        fecha_revision: comoUTC(data.fecha_revision),

        consultor_usuario: data.consultor?.usuario,
        consultor_nombre: data.consultor?.nombre_completo,
        consultor_correo: data.consultor?.correo_electronico,
        consultor_foto: data.consultor?.foto_perfil,

        nombre_comercial: data.mipyme?.nombre_comercial,
        tipo_persona: data.mipyme?.tipo_persona,
        numero_trabajadores: data.mipyme?.numero_trabajadores,

        evidencias
    };
}

// RECHAZAR UN REPORTE (SIN MANDAR A LISTA NEGRA).
export async function rechazarReportePorId({ idReporte, idAdministrador, motivoRechazo }) {
    const { data, error } = await supabase
        .from('reportes')
        .update({
            estado: 'RECHAZADO',
            id_administrador: Number(idAdministrador),
            fecha_revision: new Date().toISOString(),
            otro_motivo: motivoRechazo || 'Reporte rechazado tras revisión.'
        })
        .eq('id_reporte', Number(idReporte))
        .eq('estado', 'PENDIENTE')
        .select('id_reporte, estado, otro_motivo')
        .maybeSingle();

    if (error) throw error;
    return data;
}
