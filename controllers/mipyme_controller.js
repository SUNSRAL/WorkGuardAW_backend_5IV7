import bcrypt from 'bcryptjs';
import { createRequire } from 'module';
import { pdf } from 'pdf-to-img';
import { Jimp } from 'jimp';
import jsQR from 'jsqr';
import {
  obtenerCatalogosRegistro,
  obtenerIdTamanoPorEtiqueta,
  verificarDuplicadosPaso1,
  verificarCurpDuplicada,
  verificarUsuarioDuplicado,
  verificarListasNegras,
  obtenerIntentosRegistro,
  registrarFalloIntento,
  limpiarIntentosRegistro,
  crearRegistroMipymeCompleto,
  listarMipymesAprobadas,
  obtenerMipymePorId
} from '../modules/mipyme_module.js';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse');

// Programas de edicion
const EDITORES_SOSPECHOSOS = [
  'photoshop',
  'canva',
  'ilovepdf',
  'pdfescape',
  'word',
  'coreldraw',
  'illustrator'
];

/**
 * Normaliza cadenas para comparaciones insensibles a acentos, mayúsculas o signos
 */
function normalizarTexto(texto = '') {
  return String(texto)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extrae texto y metadatos de un archivo PDF en memoria RAM
 */
async function leerPdfMemoria(archivoObj) {
  const parsed = await pdfParse(archivoObj.buffer);
  const textoCrudo = parsed.text || '';
  const textoNormalizado = normalizarTexto(textoCrudo);
  const creador = `${parsed.info?.Creator || ''} ${parsed.info?.Producer || ''}`.toLowerCase();
  const fueEditado = EDITORES_SOSPECHOSOS.some((tool) => creador.includes(tool));

  return { textoCrudo, textoNormalizado, fueEditado };
}

/**
 * Decodifica el Código QR de las primeras páginas de un PDF en memoria RAM
 */
async function leerQrDePdf(archivoObj) {
  if (!archivoObj || !archivoObj.buffer) return null;

  try {
    const documento = await pdf(archivoObj.buffer, { scale: 2.2 });
    let pagina = 0;

    for await (const imageBuffer of documento) {
      pagina += 1;
      if (pagina > 2) break;

      const image = await Jimp.read(imageBuffer);
      const { data, width, height } = image.bitmap;
      const qr = jsQR(new Uint8ClampedArray(data), width, height);

      if (qr && qr.data) {
        return qr.data.trim();
      }
    }
    return null;
  } catch (error) {
    console.error('Error al leer código QR del PDF:', error.message);
    return null;
  }
}

/**
 * Calcula el tamaño oficial DOF (México) según el número de trabajadores (1 a 250)
 */
function calcularTamanoDOF(numTrabajadores) {
  const n = Number(numTrabajadores);
  if (n >= 1 && n <= 10) return 'Micro';
  if (n >= 11 && n <= 50) return 'Pequeña';
  if (n >= 51 && n <= 250) return 'Mediana';
  return null;
}

/**
 * Consulta cruzada opcional con el Directorio Estadístico Nacional (DENUE - INEGI)
 */
async function consultarDenueInegi({ nombreComercial, cp }) {
  const token = process.env.INEGI_DENUE_TOKEN;
  if (!token || !nombreComercial || !cp) {
    return { consultado: false, coincide: false };
  }

  try {
    const termino = encodeURIComponent(nombreComercial.trim());
    const url = `https://www.inegi.org.mx/app/api/denue/v1/consulta/Nombre/${termino}/00/1/15/${token}`;
    const resp = await fetch(url);
    if (!resp.ok) return { consultado: false, coincide: false };

    const lista = await resp.json();
    if (!Array.isArray(lista) || lista.length === 0) {
      return { consultado: true, coincide: false };
    }

    const cpLimpio = String(cp).trim();
    const match = lista.find((item) => String(item.CP || '').trim() === cpLimpio);

    if (match) {
      return {
        consultado: true,
        coincide: true,
        establecimiento: match.Nombre,
        actividad: match.Clase_actividad
      };
    }

    return { consultado: true, coincide: false };
  } catch (error) {
    console.error('Aviso DENUE INEGI:', error.message);
    return { consultado: false, coincide: false };
  }
}

/**
 * Registra fallo Naranja (máx. 3 por paso) o bloqueo Rojo y devuelve respuesta HTTP estándar
 */
async function responderFalloPaso(res, { rfc, curp, nombreComercial, paso, esRojo, mensaje }) {
  if (!rfc) {
    return res.status(esRojo ? 403 : 400).json({
      estado: esRojo ? 'ROJO' : 'NARANJA',
      bloqueado: esRojo,
      error: mensaje,
      mensaje
    });
  }

  const estadoIntento = await registrarFalloIntento({
    rfc,
    curp,
    nombreComercial,
    paso,
    esRojo,
    motivo: mensaje
  });

  if (estadoIntento.bloqueado) {
    return res.status(403).json({
      paso,
      estado: 'ROJO',
      bloqueado: true,
      intentos_restantes: 0,
      error: estadoIntento.motivoBloqueo || mensaje,
      mensaje: estadoIntento.motivoBloqueo || mensaje
    });
  }

  return res.status(422).json({
    paso,
    estado: 'NARANJA',
    bloqueado: false,
    intentos_usados: estadoIntento.intentosUsados,
    intentos_restantes: estadoIntento.intentosRestantes,
    error: mensaje,
    mensaje
  });
}

// =============================================================================
// ENDPOINTS DE CATÁLOGOS Y EVALUACIÓN POR PASOS
// =============================================================================

export async function getCatalogosMipyme(req, res) {
  try {
    const catalogos = await obtenerCatalogosRegistro();
    return res.json(catalogos);
  } catch (error) {
    console.error('Error al cargar catálogos MiPyME:', error);
    return res.status(500).json({ error: 'Error al obtener catálogos para el registro.' });
  }
}

export async function evaluarPasoMipyme(req, res) {
  try {
    const paso = Number(req.body.paso);
    const files = req.files || {};
    const rfcLimpio = String(req.body.rfc || '').trim().toUpperCase();
    const curpLimpia = String(req.body.curp || '').trim().toUpperCase();
    const nombreComercial = String(req.body.nombre_comercial || '').trim();

    if (![1, 2, 3, 4].includes(paso)) {
      return res.status(400).json({ error: 'Número de paso no válido.' });
    }

    // Verificar si el RFC o CURP ya está bloqueado por intentos fallidos previos
    if (rfcLimpio || curpLimpia) {
      const registroIntento = await obtenerIntentosRegistro(rfcLimpio, curpLimpia);
      if (registroIntento?.bloqueado) {
        return res.status(403).json({
          paso,
          estado: 'ROJO',
          bloqueado: true,
          intentos_restantes: 0,
          error: registroIntento.motivo_bloqueo || 'Este RFC/CURP se encuentra bloqueado por haber superado los intentos permitidos.'
        });
      }
    }

    // -------------------------------------------------------------------------
    // PASO 1: EXISTENCIA FISCAL (SAT + EFOS + QR CSF)
    // -------------------------------------------------------------------------
    if (paso === 1) {
      const {
        tipo_persona,
        id_giro,
        cp_fiscal,
        calle_fiscal,
        numero_fiscal,
        id_alcaldia_fiscal
      } = req.body;

      if (!tipo_persona || !nombreComercial || !rfcLimpio || !id_giro || !cp_fiscal || !calle_fiscal || !numero_fiscal || !id_alcaldia_fiscal) {
        return res.status(400).json({ error: 'Completa todos los campos obligatorios del Paso 1.' });
      }

      // 1. Validar formato oficial de RFC (12 Moral / 13 Física)
      const regexMoral = /^[A-ZÑ&]{3}\d{6}[A-Z0-9]{3}$/;
      const regexFisica = /^[A-ZÑ&]{4}\d{6}[A-Z0-9]{3}$/;
      const rfcValido = tipo_persona === 'MORAL' ? regexMoral.test(rfcLimpio) : regexFisica.test(rfcLimpio);

      if (!rfcValido) {
        return responderFalloPaso(res, {
          rfc: rfcLimpio,
          nombreComercial,
          paso: 1,
          esRojo: false,
          mensaje: `Formato de RFC inválido para Persona ${tipo_persona === 'MORAL' ? 'Moral (12 caracteres)' : 'Física (13 caracteres)'}.`
        });
      }

      // 2. Verificar duplicidad de RFC y Nombre Comercial en WorkGuard
      const duplicados = await verificarDuplicadosPaso1(rfcLimpio, nombreComercial);
      if (duplicados.existeRfc) {
        return responderFalloPaso(res, {
          rfc: rfcLimpio,
          nombreComercial,
          paso: 1,
          esRojo: true,
          mensaje: 'Este RFC ya cuenta con una empresa registrada en WorkGuard.'
        });
      }
      if (duplicados.existeNombre) {
        return responderFalloPaso(res, {
          rfc: rfcLimpio,
          nombreComercial,
          paso: 1,
          esRojo: false,
          mensaje: 'El Nombre Comercial ingresado ya está registrado por otra MiPyME en WorkGuard.'
        });
      }

      // 3. Revisar Listas Negras (SAT EFOS 69-B y Listado Negro interno) -> ROJO INMEDIATO
      const chequeoNegra = await verificarListasNegras({
        rfc: rfcLimpio,
        nombreComercial
      });
      if (chequeoNegra.enListaNegra) {
        return responderFalloPaso(res, {
          rfc: rfcLimpio,
          nombreComercial,
          paso: 1,
          esRojo: true,
          mensaje: chequeoNegra.motivo
        });
      }

      // 4. Analizar PDF de Constancia de Situación Fiscal + Código QR oficial del SAT
      const docCsf = files.doc_csf?.[0];
      if (!docCsf) {
        return res.status(400).json({ error: 'Debes adjuntar tu Constancia de Situación Fiscal en PDF.' });
      }

      const { textoNormalizado, fueEditado } = await leerPdfMemoria(docCsf);

      if (textoNormalizado.length < 40) {
        return responderFalloPaso(res, {
          rfc: rfcLimpio,
          nombreComercial,
          paso: 1,
          esRojo: false,
          mensaje: 'El PDF de la Constancia parece ser una imagen escaneada sin texto digital. Descarga el PDF original desde el portal del SAT.'
        });
      }

      if (fueEditado) {
        return responderFalloPaso(res, {
          rfc: rfcLimpio,
          nombreComercial,
          paso: 1,
          esRojo: false,
          mensaje: 'Se detectaron metadatos de edición externa en la Constancia. Sube el archivo original sin modificar.'
        });
      }

      if (!textoNormalizado.includes(rfcLimpio) || !textoNormalizado.includes('CONSTANCIA DE SITUACION FISCAL')) {
        return responderFalloPaso(res, {
          rfc: rfcLimpio,
          nombreComercial,
          paso: 1,
          esRojo: false,
          mensaje: `El documento cargado no corresponde a una Constancia de Situación Fiscal válida para el RFC ${rfcLimpio}.`
        });
      }

      // Validar Código QR oficial del SAT (siat.sat.gob.mx + RFC)
      const contenidoQr = await leerQrDePdf(docCsf);
      if (!contenidoQr || !contenidoQr.toLowerCase().includes('sat.gob.mx') || !contenidoQr.toUpperCase().includes(rfcLimpio)) {
        return responderFalloPaso(res, {
          rfc: rfcLimpio,
          nombreComercial,
          paso: 1,
          esRojo: false,
          mensaje: 'No se pudo verificar el Código QR oficial del SAT en la Constancia o el RFC del QR no coincide.'
        });
      }

      return res.json({
        paso: 1,
        estado: 'VERDE',
        mensaje: 'Paso 1 validado en Verde: Constancia SAT, Código QR oficial y estatus fiscal verificados.'
      });
    }

    // -------------------------------------------------------------------------
    // PASO 2: ACTIVIDAD Y UBICACIÓN (Mapa + Comprobante + Cruce DENUE INEGI)
    // -------------------------------------------------------------------------
    if (paso === 2) {
      const {
        cp_operaciones,
        calle_operaciones,
        numero_operaciones,
        id_alcaldia_operaciones,
        geolocalizado
      } = req.body;

      if (!cp_operaciones || !calle_operaciones || !numero_operaciones || !id_alcaldia_operaciones) {
        return res.status(400).json({ error: 'Completa todos los campos del domicilio de operaciones.' });
      }

      if (!/^\d{5}$/.test(String(cp_operaciones).trim())) {
        return responderFalloPaso(res, {
          rfc: rfcLimpio,
          nombreComercial,
          paso: 2,
          esRojo: false,
          mensaje: 'El Código Postal de operaciones debe tener exactamente 5 dígitos.'
        });
      }

      if (geolocalizado !== 'true') {
        return res.status(400).json({
          error: 'Presiona "Ubicar en Mapa" para confirmar las coordenadas del domicilio antes de continuar.'
        });
      }

      const docComprobante = files.doc_comprobante?.[0];
      if (!docComprobante) {
        return res.status(400).json({ error: 'Debes adjuntar tu Comprobante de Domicilio en PDF.' });
      }

      const { textoNormalizado, fueEditado } = await leerPdfMemoria(docComprobante);

      if (textoNormalizado.length < 40) {
        return responderFalloPaso(res, {
          rfc: rfcLimpio,
          nombreComercial,
          paso: 2,
          esRojo: false,
          mensaje: 'El Comprobante de Domicilio parece una imagen escaneada sin texto legible. Sube el recibo digital en PDF.'
        });
      }

      if (fueEditado) {
        return responderFalloPaso(res, {
          rfc: rfcLimpio,
          nombreComercial,
          paso: 2,
          esRojo: false,
          mensaje: 'Se detectaron rastros de edición externa en el Comprobante de Domicilio.'
        });
      }

      const cpLimpio = String(cp_operaciones).trim();
      const palabrasCalle = normalizarTexto(calle_operaciones).split(' ').filter((w) => w.length >= 4);
      const coincideCp = textoNormalizado.includes(cpLimpio);
      const coincideCalle = palabrasCalle.some((w) => textoNormalizado.includes(w));

      if (!coincideCp && !coincideCalle) {
        return responderFalloPaso(res, {
          rfc: rfcLimpio,
          nombreComercial,
          paso: 2,
          esRojo: false,
          mensaje: `El Comprobante de Domicilio no coincide con la calle ni el Código Postal (${cpLimpio}) capturados.`
        });
      }

      // Consulta cruzada opcional con DENUE (INEGI)
      const denue = await consultarDenueInegi({
        nombreComercial,
        cp: cpLimpio
      });

      return res.json({
        paso: 2,
        estado: 'VERDE',
        validado_denue: Boolean(denue.coincide),
        mensaje: denue.coincide
          ? `Paso 2 validado en Verde + Establecimiento confirmado en DENUE INEGI (${denue.establecimiento}).`
          : 'Paso 2 validado en Verde: Domicilio verificado en mapa y comprobante.'
      });
    }

    // -------------------------------------------------------------------------
    // PASO 3: REPRESENTANTE LEGAL / TITULAR (Nombre + CURP + PDF gob.mx)
    // -------------------------------------------------------------------------
    if (paso === 3) {
      const { nombre_completo, tipo_persona } = req.body;

      if (!nombre_completo || !curpLimpia) {
        return res.status(400).json({ error: 'Ingresa el nombre completo y la CURP del representante o titular.' });
      }

      const regexCurp = /^[A-Z][AEIOUX][A-Z]{2}\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])HM[B-DF-HJ-NP-TV-Z]{3}[0-9A-Z]\d$/;
      if (!regexCurp.test(curpLimpia)) {
        return responderFalloPaso(res, {
          rfc: rfcLimpio,
          curp: curpLimpia,
          nombreComercial,
          paso: 3,
          esRojo: false,
          mensaje: 'La CURP ingresada no cumple con la estructura oficial de 18 caracteres de RENAPO.'
        });
      }

      // Verificar si la CURP ya está registrada en otro representante
      const curpExiste = await verificarCurpDuplicada(curpLimpia);
      if (curpExiste) {
        return responderFalloPaso(res, {
          rfc: rfcLimpio,
          curp: curpLimpia,
          nombreComercial,
          paso: 3,
          esRojo: true,
          mensaje: 'Esta CURP ya se encuentra asociada a otra empresa registrada en WorkGuard.'
        });
      }

      // Verificar si la CURP pertenece a alguien sancionado en Listado Negro
      const chequeoNegraCurp = await verificarListasNegras({ curp: curpLimpia });
      if (chequeoNegraCurp.enListaNegra) {
        return responderFalloPaso(res, {
          rfc: rfcLimpio,
          curp: curpLimpia,
          nombreComercial,
          paso: 3,
          esRojo: true,
          mensaje: chequeoNegraCurp.motivo
        });
      }

      // Si es Persona Física, los primeros 10 dígitos de CURP y RFC deben coincidir
      if (tipo_persona === 'FISICA' && rfcLimpio.length === 13) {
        if (curpLimpia.slice(0, 10) !== rfcLimpio.slice(0, 10)) {
          return responderFalloPaso(res, {
            rfc: rfcLimpio,
            curp: curpLimpia,
            nombreComercial,
            paso: 3,
            esRojo: false,
            mensaje: 'Para Persona Física, los primeros 10 caracteres de la CURP deben coincidir con el RFC.'
          });
        }
      }

      const docCurp = files.doc_curp?.[0];
      if (!docCurp) {
        return res.status(400).json({ error: 'Debes adjuntar la Constancia oficial de la CURP en PDF.' });
      }

      const { textoNormalizado, fueEditado } = await leerPdfMemoria(docCurp);

      if (textoNormalizado.length < 40) {
        return responderFalloPaso(res, {
          rfc: rfcLimpio,
          curp: curpLimpia,
          nombreComercial,
          paso: 3,
          esRojo: false,
          mensaje: 'El PDF de la CURP não contiene texto digital legible. Descárgalo directamente de gob.mx/curp.'
        });
      }

      if (fueEditado) {
        return responderFalloPaso(res, {
          rfc: rfcLimpio,
          curp: curpLimpia,
          nombreComercial,
          paso: 3,
          esRojo: false,
          mensaje: 'Se detectaron rastros de edición externa en la Constancia de CURP.'
        });
      }

      if (!textoNormalizado.includes(curpLimpia) || !textoNormalizado.includes('CLAVE UNICA DE REGISTRO DE POBLACION')) {
        return responderFalloPaso(res, {
          rfc: rfcLimpio,
          curp: curpLimpia,
          nombreComercial,
          paso: 3,
          esRojo: false,
          mensaje: 'El PDF adjunto no corresponde a una Constancia oficial de CURP válida o la clave no coincide.'
        });
      }

      // Verificar que el nombre ingresado aparezca en la constancia CURP
      const palabrasNombre = normalizarTexto(nombre_completo).split(' ').filter((w) => w.length >= 3);
      const coincidencias = palabrasNombre.filter((w) => textoNormalizado.includes(w));

      if (palabrasNombre.length > 0 && coincidencias.length === 0) {
        return responderFalloPaso(res, {
          rfc: rfcLimpio,
          curp: curpLimpia,
          nombreComercial,
          paso: 3,
          esRojo: false,
          mensaje: 'El nombre completo ingresado no coincide con el titular de la Constancia CURP.'
        });
      }

      return res.json({
        paso: 3,
        estado: 'VERDE',
        mensaje: 'Paso 3 validado en Verde: Identidad y constancia CURP verificadas.'
      });
    }

    // -------------------------------------------------------------------------
    // PASO 4: CUMPLIMIENTO Y TAMAÑO (Trabajadores DOF + Opinión 32-D + QR SAT)
    // -------------------------------------------------------------------------
    if (paso === 4) {
      const trabajadores = Number(req.body.numero_trabajadores);

      if (!trabajadores || trabajadores < 1) {
        return res.status(400).json({ error: 'Ingresa un número válido de trabajadores (mínimo 1).' });
      }

      if (trabajadores > 250) {
        return responderFalloPaso(res, {
          rfc: rfcLimpio,
          nombreComercial,
          paso: 4,
          esRojo: true,
          mensaje: 'La empresa excede el límite de 250 trabajadores para clasificarse como MiPyME según el DOF.'
        });
      }

      const tamanoEtiqueta = calcularTamanoDOF(trabajadores);
      const idTamano = await obtenerIdTamanoPorEtiqueta(tamanoEtiqueta);

      const doc32d = files.doc_opinion_32d?.[0];
      if (!doc32d) {
        return res.status(400).json({ error: 'Debes adjuntar la Opinión del Cumplimiento de Obligaciones Fiscales (32-D) en PDF.' });
      }

      const { textoNormalizado, fueEditado } = await leerPdfMemoria(doc32d);

      if (textoNormalizado.length < 40) {
        return responderFalloPaso(res, {
          rfc: rfcLimpio,
          nombreComercial,
          paso: 4,
          esRojo: false,
          mensaje: 'El PDF de la Opinión 32-D no tiene texto legible. Descarga el documento original desde el portal del SAT.'
        });
      }

      if (fueEditado) {
        return responderFalloPaso(res, {
          rfc: rfcLimpio,
          nombreComercial,
          paso: 4,
          esRojo: false,
          mensaje: 'Se detectaron metadatos de edición externa en la Opinión 32-D.'
        });
      }

      if (!textoNormalizado.includes(rfcLimpio) || !textoNormalizado.includes('OPINION DEL CUMPLIMIENTO')) {
        return responderFalloPaso(res, {
          rfc: rfcLimpio,
          nombreComercial,
          paso: 4,
          esRojo: false,
          mensaje: `El documento adjunto no corresponde a una Opinión del Cumplimiento (32-D) válida para el RFC ${rfcLimpio}.`
        });
      }

      if (textoNormalizado.includes('NEGATIVO') && !textoNormalizado.includes('POSITIVO')) {
        return responderFalloPaso(res, {
          rfc: rfcLimpio,
          nombreComercial,
          paso: 4,
          esRojo: true,
          mensaje: 'La Opinión del Cumplimiento (32-D) reporta sentido NEGATIVO ante el SAT.'
        });
      }

      if (!textoNormalizado.includes('POSITIVO')) {
        return responderFalloPaso(res, {
          rfc: rfcLimpio,
          nombreComercial,
          paso: 4,
          esRojo: false,
          mensaje: 'No se pudo confirmar el sentido POSITIVO en la Opinión del Cumplimiento 32-D.'
        });
      }

      // Validar Código QR oficial del SAT en la Opinión 32-D
      const qr32d = await leerQrDePdf(doc32d);
      if (!qr32d || !qr32d.toLowerCase().includes('sat.gob.mx') || !qr32d.toUpperCase().includes(rfcLimpio)) {
        return responderFalloPaso(res, {
          rfc: rfcLimpio,
          nombreComercial,
          paso: 4,
          esRojo: false,
          mensaje: 'No se pudo verificar el Código QR oficial del SAT en la Opinión 32-D o el RFC no coincide.'
        });
      }

      return res.json({
        paso: 4,
        estado: 'VERDE',
        tamano_calculado: tamanoEtiqueta,
        id_tamano: idTamano,
        mensaje: `Paso 4 validado en Verde: Opinión 32-D POSITIVA (con QR SAT) y tamaño clasificado como ${tamanoEtiqueta}.`
      });
    }
  } catch (error) {
    console.error('Error al evaluar paso MiPyME:', error);
    return res.status(500).json({ error: 'Error interno al validar el paso.' });
  }
}

// =============================================================================
// REGISTRO DEFINITIVO DE LA MIPYME (CON SELLO WORKGUARD AUTOMÁTICO)
// =============================================================================
export async function registrarMipyme(req, res) {
  try {
    const datos = typeof req.body.payload === 'string'
      ? JSON.parse(req.body.payload)
      : req.body;

    const {
      usuario,
      contrasena,
      nombre_comercial,
      tipo_persona,
      rfc,
      id_giro,
      numero_trabajadores,
      id_tamano,
      domicilio_fiscal,
      domicilio_operaciones,
      actividad,
      representante,
      validado_denue
    } = datos;

    if (!usuario || !contrasena || !nombre_comercial || !rfc || !tipo_persona || !representante?.curp || !representante?.nombre_completo) {
      return res.status(400).json({ error: 'Faltan datos obligatorios para completar el registro.' });
    }

    const rfcLimpio = rfc.trim().toUpperCase();
    const curpLimpia = representante.curp.trim().toUpperCase();
    const usuarioLimpio = usuario.trim();

    // 1. Verificar que no exista bloqueo previo ni inclusión en Listas Negras
    const intentoPrevio = await obtenerIntentosRegistro(rfcLimpio, curpLimpia);
    if (intentoPrevio?.bloqueado) {
      return res.status(403).json({
        error: intentoPrevio.motivo_bloqueo || 'Este RFC/CURP se encuentra bloqueado para registro.'
      });
    }

    const chequeoNegra = await verificarListasNegras({
      rfc: rfcLimpio,
      curp: curpLimpia,
      nombreComercial: nombre_comercial
    });
    if (chequeoNegra.enListaNegra) {
      return res.status(403).json({ error: chequeoNegra.motivo });
    }

    // 2. Verificar unicidad de usuario, RFC, Nombre Comercial y CURP
    const [usuarioOcupado, dupPaso1, curpOcupada] = await Promise.all([
      verificarUsuarioDuplicado(usuarioLimpio),
      verificarDuplicadosPaso1(rfcLimpio, nombre_comercial.trim()),
      verificarCurpDuplicada(curpLimpia)
    ]);

    if (usuarioOcupado) {
      return res.status(409).json({ error: 'Ese nombre de usuario ya está ocupado en WorkGuard.' });
    }
    if (dupPaso1.existeRfc) {
      return res.status(409).json({ error: 'Este RFC ya se encuentra registrado en WorkGuard.' });
    }
    if (dupPaso1.existeNombre) {
      return res.status(409).json({ error: 'Este Nombre Comercial ya se encuentra registrado en WorkGuard.' });
    }
    if (curpOcupada) {
      return res.status(409).json({ error: 'Esta CURP ya está asociada a otra cuenta en WorkGuard.' });
    }

    // 3. Calcular id_tamano oficial DOF si no viene informado
    const etiquetaDof = calcularTamanoDOF(numero_trabajadores) || 'Micro';
    const idTamanoFinal = id_tamano || (await obtenerIdTamanoPorEtiqueta(etiquetaDof));
    const contrasenaHash = await bcrypt.hash(contrasena, 10);

    const creada = await crearRegistroMipymeCompleto({
      usuario: usuarioLimpio,
      contrasena_hash: contrasenaHash,
      nombre_comercial: nombre_comercial.trim(),
      tipo_persona,
      rfc: rfcLimpio,
      id_giro,
      numero_trabajadores,
      id_tamano: idTamanoFinal,
      domicilio_fiscal,
      domicilio_operaciones,
      actividad: actividad || {},
      representante: {
        nombre_completo: representante.nombre_completo.trim(),
        curp: curpLimpia
      },
      validado_denue: Boolean(validado_denue)
    });

    // 4. Eliminar registro temporal de intentos fallidos
    await limpiarIntentosRegistro(rfcLimpio);

    return res.status(201).json({
      mensaje: '¡Registro completado con éxito! Tu Sello WorkGuard ya está activo.',
      mipyme: creada
    });
  } catch (error) {
    console.error('Error al registrar MiPyME:', error);
    return res.status(500).json({ error: 'Error interno al guardar el registro de la MiPyME.' });
  }
}

// =============================================================================
// ENDPOINTS DE CONSULTA (CONSULTOR Y SUPERVISIÓN ADMIN)
// =============================================================================
export async function getMipymesPublicas(req, res) {
  try {
    const empresas = await listarMipymesAprobadas();
    return res.json(empresas);
  } catch (error) {
    console.error('Error al listar MiPyMEs:', error);
    return res.status(500).json({ error: 'Error al obtener el directorio de MiPyMEs.' });
  }
}

export async function getDetalleMipyme(req, res) {
  try {
    const id = Number(req.params.id);
    const empresa = await obtenerMipymePorId(id);
    if (!empresa) {
      return res.status(404).json({ error: 'MiPyME no encontrada.' });
    }
    return res.json(empresa);
  } catch (error) {
    console.error('Error al obtener detalle de MiPyME:', error);
    return res.status(500).json({ error: 'Error al obtener información de la MiPyME.' });
  }
}