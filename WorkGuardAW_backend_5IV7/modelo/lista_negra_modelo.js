// modelo/lista_negra_modelo.js
// Lista negra = reportes que el administrador ACEPTÓ y para los que escribió un motivo (reportes.otro_motivo).
import { supabase } from '../bd.js';

function comoUTC(valor) {
    if (!valor) return null;
    return /([zZ]|[+-]\d{2}:?\d{2})$/.test(valor) ? valor : valor + 'Z';
}

// Envía a lista negra la MiPyME del reporte indicado. Solo funciona con reportes PENDIENTES.
// Devuelve 'ok', 'no_existe' o 'ya_revisado'.
export async function enviarALaListaNegra({ idReporte, idAdministrador, motivo }) {
    const { data, error } = await supabase
        .from('reportes')
        .update({
            estado: 'ACEPTADO',
            otro_motivo: motivo,
            id_administrador: idAdministrador,
            fecha_revision: new Date().toISOString() // la columna guarda la hora UTC
        })
        .eq('id_reporte', idReporte)
        .eq('estado', 'PENDIENTE') // la condición va en el mismo UPDATE: no se puede aceptar dos veces
        .select('id_reporte');
    if (error) throw error;
    if (data.length > 0) return 'ok';

    const existe = await supabase
        .from('reportes')
        .select('id_reporte')
        .eq('id_reporte', idReporte)
        .maybeSingle();
    if (existe.error) throw existe.error;
    return existe.data ? 'ya_revisado' : 'no_existe';
}

// Empresas en lista negra: una por MiPyME (con el motivo de su revisión más reciente).
export async function listarEmpresasEnListaNegra() {
    const { data, error } = await supabase
        .from('reportes')
        .select('id_mipyme, otro_motivo, fecha_revision, mipyme(nombre_comercial)')
        .eq('estado', 'ACEPTADO')
        .not('otro_motivo', 'is', null)
        .neq('otro_motivo', '')
        .order('fecha_revision', { ascending: false, nullsFirst: false });
    if (error) throw error;

    const porEmpresa = new Map(); // ya viene del más reciente al más antiguo: se conserva el primero
    for (const r of data) {
        if (!porEmpresa.has(r.id_mipyme)) {
            porEmpresa.set(r.id_mipyme, {
                id_mipyme: r.id_mipyme,
                nombre_comercial: r.mipyme?.nombre_comercial,
                motivo_lista_negra: r.otro_motivo,
                fecha_revision: comoUTC(r.fecha_revision)
            });
        }
    }
    return [...porEmpresa.values()];
}
