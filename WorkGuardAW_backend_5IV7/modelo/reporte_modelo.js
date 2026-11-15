// Consultas a Supabase para los reportes (versión supabase-js).
import { supabase } from '../bd.js';

const LIMITE_LISTA = 200;

// Las columnas fecha_reporte y fecha_revision son "timestamp without time zone" y Supabase guarda la hora
// en UTC. PostgREST las devuelve sin zona; sin la "Z" el navegador las leería como hora local.
function comoUTC(valor) {
    if (!valor) return null;
    return /([zZ]|[+-]\d{2}:?\d{2})$/.test(valor) ? valor : valor + 'Z';
}

// Guarda un reporte nuevo y devuelve su id.
// estado, fecha_reporte y anonimo toman su valor por defecto en la base de datos.
export async function crearReporte({ idMipyme, idConsultor, motivo, descripcion }) {
    const { data, error } = await supabase
        .from('reportes')
        .insert([{ id_mipyme: idMipyme, id_consultor: idConsultor, motivo, descripcion }])
        .select('id_reporte');
    if (error) throw error;
    return data[0].id_reporte;
}

const COLUMNAS_LISTA =
    'id_reporte, id_consultor, motivo, descripcion, estado, fecha_reporte, consultor(usuario), mipyme(nombre_comercial)';

function aplanarLista(r) {
    return {
        id_reporte: r.id_reporte,
        id_consultor: r.id_consultor,
        motivo: r.motivo,
        descripcion: r.descripcion,
        estado: r.estado,
        fecha_reporte: comoUTC(r.fecha_reporte),
        consultor_usuario: r.consultor?.usuario,
        nombre_comercial: r.mipyme?.nombre_comercial
    };
}

// Lista de reportes con el usuario que lo envió y la empresa. Los pendientes salen primero
// y nunca se recortan; el resto completa hasta LIMITE_LISTA, del más reciente al más antiguo.
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
    return [...pendientes.data, ...otros].map(aplanarLista);
}

// Un reporte completo con los datos del consultor y de la MiPyME. Devuelve null si no existe.
export async function obtenerReportePorId(idReporte) {
    const { data, error } = await supabase
        .from('reportes')
        .select(`id_reporte, id_mipyme, id_consultor, motivo, otro_motivo, descripcion, estado, id_administrador,
                 fecha_reporte, fecha_revision,
                 consultor(usuario, nombre_completo, correo_electronico),
                 mipyme(nombre_comercial, tipo_persona, numero_trabajadores)`)
        .eq('id_reporte', idReporte)
        .maybeSingle();
    if (error) throw error;
    if (!data) return null;
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
        nombre_comercial: data.mipyme?.nombre_comercial,
        tipo_persona: data.mipyme?.tipo_persona,
        numero_trabajadores: data.mipyme?.numero_trabajadores
    };
}
