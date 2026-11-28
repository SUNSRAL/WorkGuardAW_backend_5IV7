import bcrypt from "bcryptjs";
import { PNG } from "pngjs";
import jsQR from "jsqr";
import { PDFParse } from "pdf-parse";
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
  obtenerMipymePorId,
  subirImagenStorage,
  actualizarPerfilMipyme,
  guardarFotoEstablecimiento,
  eliminarFotoEstablecimiento,
  listarSolicitudesAdmin,
  dictaminarSolicitudMipyme,
  listarEfosSatAdmin,
} from "../modules/mipyme_module.js";

const GENERADORES_OFICIALES = [
  "itext",
  "jasper",
  "oracle",
  "bi publisher",
  "fop",
  "renapo",
  "gob.mx",
  "sat",
];

const EDITORES_PROHIBIDOS = [
  "photoshop",
  "canva",
  "ilovepdf",
  "pdfescape",
  "word",
  "microsoft",
  "writer",
  "coreldraw",
  "illustrator",
  "skia",
  "quartz",
];

const EMISORES_COMPROBANTE = [
  "COMISION FEDERAL DE ELECTRICIDAD",
  "CFE",
  "CSS160330CP7",
  "SISTEMA DE AGUAS",
  "SACMEX",
  "TELEFONOS DE MEXICO",
  "TELMEX",
  "TME840315KT6",
  "IZZI",
  "TOTALPLAY",
  "MEGACABLE",
  "PREDIAL",
  "TESORERIA",
  "ESTADO DE CUENTA",
];

function normalizarTexto(texto = "") {
  return String(texto)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function leerPdfMemoria(fileObj) {
  if (!fileObj || !fileObj.buffer) {
    return {
      textoCrudo: "",
      textoNormalizado: "",
      esOficialSat: false,
      fueManipulado: true,
    };
  }
  const parser = new PDFParse({ data: fileObj.buffer });
  try {
    const [resultado, info] = await Promise.all([
      parser.getText(),
      parser.getInfo().catch(() => ({})),
    ]);

    const textoCrudo = resultado?.text || "";
    const textoNormalizado = normalizarTexto(textoCrudo);
    const metadatos = JSON.stringify(info || {}).toLowerCase();

    const tieneEditorProhibido = EDITORES_PROHIBIDOS.some((ed) =>
      metadatos.includes(ed)
    );
    const tieneGeneradorOficial = GENERADORES_OFICIALES.some((gen) =>
      metadatos.includes(gen)
    );

    const tieneEstructuraCriptograficaSat =
      textoNormalizado.includes("CADENA ORIGINAL") &&
      textoNormalizado.includes("SELLO DIGITAL");

    const esOficialSat =
      !tieneEditorProhibido &&
      (tieneGeneradorOficial || tieneEstructuraCriptograficaSat);

    return {
      textoCrudo,
      textoNormalizado,
      esOficialSat,
      fueManipulado: tieneEditorProhibido,
    };
  } finally {
    await parser.destroy().catch(() => {});
  }
}

async function leerQrDePdf(pdfBuffer) {
  if (!pdfBuffer) return null;
  const parser = new PDFParse({ data: pdfBuffer });
  try {
    const capturas = await parser.getScreenshot({ scale: 3.5, first: 2 });
    for (const pagina of capturas?.pages || []) {
      if (!pagina?.data) continue;
      const png = PNG.sync.read(Buffer.from(pagina.data));
      const codigo = jsQR(
        new Uint8ClampedArray(png.data),
        png.width,
        png.height,
        { inversionAttempts: "attemptBoth" }
      );
      if (codigo && codigo.data) {
        return codigo.data.trim();
      }
    }
    return null;
  } catch (err) {
    console.error("Error leyendo QR del PDF:", err.message);
    return null;
  } finally {
    await parser.destroy().catch(() => {});
  }
}

/**
 * Valida estrictamente la estructura oficial de la URL dentro del QR del SAT
 */
function validarUrlQrSat(urlQr, tipoDocumento, rfcEsperado) {
  try {
    const url = new URL(urlQr.trim());
    if (url.protocol !== "https:") return { valida: false, idDocumento: null };
    if (url.hostname !== "siat.sat.gob.mx")
      return { valida: false, idDocumento: null };
    if (url.pathname !== "/app/qr/faces/pages/mobile/validadorqr.jsf") {
      return { valida: false, idDocumento: null };
    }

    const d1 = url.searchParams.get("D1");
    const d3 = (url.searchParams.get("D3") || "").toUpperCase();

    if (tipoDocumento === "CSF" && d1 !== "10")
      return { valida: false, idDocumento: null };
    if (tipoDocumento === "32D" && (!d1 || d1 === "10"))
      return { valida: false, idDocumento: null };

    const partesD3 = d3.split("_");
    if (partesD3.length !== 2) return { valida: false, idDocumento: null };

    const [idDocumento, rfcQr] = partesD3;
    if (rfcQr !== rfcEsperado.toUpperCase() || !idDocumento) {
      return { valida: false, idDocumento: null };
    }

    return { valida: true, idDocumento, urlLimpia: url.toString() };
  } catch {
    return { valida: false, idDocumento: null };
  }
}

function verificarVigencia32D(textoCrudo = "") {
  const meses = {
    ENERO: 0,
    FEBRERO: 1,
    MARZO: 2,
    ABRIL: 3,
    MAYO: 4,
    JUNIO: 5,
    JULIO: 6,
    AGOSTO: 7,
    SEPTIEMBRE: 8,
    OCTUBRE: 9,
    NOVIEMBRE: 10,
    DICIEMBRE: 11,
  };
  const norm = normalizarTexto(textoCrudo);
  const match = norm.match(
    /(\d{1,2})\s+DE\s+(ENERO|FEBRERO|MARZO|ABRIL|MAYO|JUNIO|JULIO|AGOSTO|SEPTIEMBRE|OCTUBRE|NOVIEMBRE|DICIEMBRE)\s+DE\s+(20\d{2})/
  );

  if (!match) return { verificada: false, vigente: true };

  const dia = Number(match[1]);
  const mes = meses[match[2]];
  const anio = Number(match[3]);

  const fechaEmision = new Date(anio, mes, dia);
  const hoy = new Date();
  const diffDias = (hoy - fechaEmision) / (1000 * 60 * 60 * 24);

  return {
    verificada: true,
    vigente: diffDias >= -1 && diffDias <= 31,
  };
}

function extraerNombreContribuyenteCsf(textoCrudo = "", tipoPersona = "MORAL") {
  const lineas = textoCrudo
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (tipoPersona === "MORAL") {
    for (let i = 0; i < lineas.length; i++) {
      const norm = normalizarTexto(lineas[i]);
      if (norm.includes("DENOMINACION RAZON SOCIAL")) {
        const inline = lineas[i].split(":").slice(1).join(":").trim();
        if (inline.length >= 3) return normalizarTexto(inline);
        if (lineas[i + 1]) return normalizarTexto(lineas[i + 1]);
      }
    }
  } else {
    let nombre = "";
    let ap1 = "";
    let ap2 = "";
    for (let i = 0; i < lineas.length; i++) {
      const norm = normalizarTexto(lineas[i]);
      if (norm.startsWith("NOMBRE S")) {
        nombre =
          lineas[i].split(":").slice(1).join(":").trim() ||
          lineas[i + 1] ||
          "";
      } else if (norm.startsWith("PRIMER APELLIDO")) {
        ap1 =
          lineas[i].split(":").slice(1).join(":").trim() ||
          lineas[i + 1] ||
          "";
      } else if (norm.startsWith("SEGUNDO APELLIDO")) {
        ap2 =
          lineas[i].split(":").slice(1).join(":").trim() ||
          lineas[i + 1] ||
          "";
      }
    }
    const completo = normalizarTexto(`${nombre} ${ap1} ${ap2}`);
    if (completo.length >= 5) return completo;
  }
  return "";
}

function calcularTamanoDOF(numTrabajadores) {
  const n = Number(numTrabajadores);
  if (n >= 1 && n <= 10) return "Micro";
  if (n >= 11 && n <= 50) return "Pequeña";
  if (n >= 51 && n <= 250) return "Mediana";
  return null;
}

async function consultarDenueInegi({ nombreComercial, cp, lat, lon }) {
  const token = process.env.INEGI_DENUE_TOKEN;
  if (!token || !nombreComercial || !cp) {
    return { consultado: false, coincide: false };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const termino = encodeURIComponent(nombreComercial.trim());
    const coords = lat && lon ? `${lat},${lon}` : "0,0";
    const url =
      lat && lon
        ? `https://www.inegi.org.mx/app/api/denue/v1/consulta/Buscar/${termino}/${coords}/250/${token}`
        : `https://www.inegi.org.mx/app/api/denue/v1/consulta/Nombre/${termino}/00/1/15/${token}`;

    const resp = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!resp.ok) return { consultado: false, coincide: false };

    const lista = await resp.json();
    if (!Array.isArray(lista) || lista.length === 0) {
      return { consultado: true, coincide: false };
    }

    const cpLimpio = String(cp).trim();
    const match =
      lista.find((item) => String(item.CP || "").trim() === cpLimpio) ||
      lista[0];

    if (match) {
      return {
        consultado: true,
        coincide: true,
        establecimiento: match.Nombre,
        actividad: match.Clase_actividad,
      };
    }

    return { consultado: true, coincide: false };
  } catch (error) {
    console.warn("Aviso DENUE INEGI:", error.message);
    return { consultado: false, coincide: false };
  }
}

async function responderFalloPaso(
  res,
  { rfc, curp, nombreComercial, paso, esRojo, mensaje }
) {
  if (!rfc) {
    return res.status(esRojo ? 403 : 400).json({
      estado: esRojo ? "ROJO" : "NARANJA",
      bloqueado: esRojo,
      error: mensaje,
      mensaje,
    });
  }

  const estadoIntento = await registrarFalloIntento({
    rfc,
    curp,
    nombreComercial,
    paso,
    esRojo,
    motivo: mensaje,
  });

  if (estadoIntento.bloqueado) {
    const msgRojo = estadoIntento.motivoBloqueo || mensaje;
    return res.status(403).json({
      paso,
      estado: "ROJO",
      bloqueado: true,
      intentos_restantes: 0,
      error: msgRojo,
      mensaje: msgRojo,
    });
  }

  const msgConIntento = `${mensaje} (Intento ${estadoIntento.intentosUsados} de 3 — te quedan ${estadoIntento.intentosRestantes} intentos en este paso antes del bloqueo permanente).`;

  return res.status(422).json({
    paso,
    estado: "NARANJA",
    bloqueado: false,
    intentos_usados: estadoIntento.intentosUsados,
    intentos_restantes: estadoIntento.intentosRestantes,
    error: msgConIntento,
    mensaje: msgConIntento,
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
    console.error("Error al cargar catálogos MiPyME:", error);
    return res
      .status(500)
      .json({ error: "Error al obtener catálogos para el registro." });
  }
}
export async function evaluarPasoMipyme(req, res) {
  try {
    const paso = Number(req.body.paso);
    const files = req.files || {};
    const rfcLimpio = String(req.body.rfc || "")
      .trim()
      .toUpperCase();
    const curpLimpia = String(req.body.curp || "")
      .trim()
      .toUpperCase();
    const nombreComercial = String(req.body.nombre_comercial || "").trim();
    if (![1, 2, 3, 4].includes(paso)) {
      return res.status(400).json({ error: "Número de paso no válido." });
    }
    if (rfcLimpio || curpLimpia) {
      const registroIntento = await obtenerIntentosRegistro(
        rfcLimpio,
        curpLimpia
      );
      if (registroIntento?.bloqueado) {
        return res.status(403).json({
          paso,
          estado: "ROJO",
          bloqueado: true,
          intentos_restantes: 0,
          error:
            registroIntento.motivo_bloqueo ||
            "Este RFC/CURP se encuentra bloqueado por haber superado los intentos permitidos.",
        });
      }
    }
    // PASO 1: EXISTENCIA FISCAL
    if (paso === 1) {
      const {
        tipo_persona,
        id_giro,
        cp_fiscal,
        calle_fiscal,
        numero_fiscal,
        id_alcaldia_fiscal,
      } = req.body;
      if (
        !tipo_persona ||
        !nombreComercial ||
        !rfcLimpio ||
        !id_giro ||
        !cp_fiscal ||
        !calle_fiscal ||
        !numero_fiscal ||
        !id_alcaldia_fiscal
      ) {
        return res
          .status(400)
          .json({ error: "Completa todos los campos obligatorios del Paso 1." });
      }
      const regexMoral = /^[A-ZÑ&]{3}\d{6}[A-Z0-9]{3}$/;
      const regexFisica = /^[A-ZÑ&]{4}\d{6}[A-Z0-9]{3}$/;
      const rfcValido =
        tipo_persona === "MORAL"
          ? regexMoral.test(rfcLimpio)
          : regexFisica.test(rfcLimpio);
      if (!rfcValido) {
        return responderFalloPaso(res, {
          rfc: rfcLimpio,
          nombreComercial,
          paso: 1,
          esRojo: false,
          mensaje: `Formato de RFC inválido para Persona ${
            tipo_persona === "MORAL"
              ? "Moral (12 caracteres)"
              : "Física (13 caracteres)"
          }.`,
        });
      }
      const duplicados = await verificarDuplicadosPaso1(
        rfcLimpio,
        nombreComercial
      );
      if (duplicados.existeRfc) {
        return responderFalloPaso(res, {
          rfc: rfcLimpio,
          nombreComercial,
          paso: 1,
          esRojo: true,
          mensaje: "Este RFC ya cuenta con una empresa registrada en WorkGuard.",
        });
      }
      if (duplicados.existeNombre) {
        return responderFalloPaso(res, {
          rfc: rfcLimpio,
          nombreComercial,
          paso: 1,
          esRojo: false,
          mensaje:
            "El Nombre Comercial ingresado ya está registrado por otra MiPyME en WorkGuard.",
        });
      }
      const chequeoNegra = await verificarListasNegras({
        rfc: rfcLimpio,
        nombreComercial,
      });
      if (chequeoNegra.enListaNegra) {
        return responderFalloPaso(res, {
          rfc: rfcLimpio,
          nombreComercial,
          paso: 1,
          esRojo: true,
          mensaje: chequeoNegra.motivo,
        });
      }
      const docCsf = files.doc_csf?.[0];
      if (!docCsf) {
        return res.status(400).json({
          error: "Debes adjuntar tu Constancia de Situación Fiscal en PDF.",
        });
      }
      const { textoCrudo, textoNormalizado, esOficialSat, fueManipulado } =
        await leerPdfMemoria(docCsf);
      if (textoNormalizado.length < 60) {
        return responderFalloPaso(res, {
          rfc: rfcLimpio,
          nombreComercial,
          paso: 1,
          esRojo: false,
          mensaje:
            "El PDF de la Constancia es una imagen escaneada sin texto digital. Descarga el archivo original del portal del SAT.",
        });
      }
      if (fueManipulado || !esOficialSat) {
        return responderFalloPaso(res, {
          rfc: rfcLimpio,
          nombreComercial,
          paso: 1,
          esRojo: false,
          mensaje:
            "El PDF no conserva la estructura oficial generada por el SAT (parece haber sido reimpreso o editado en Word/navegador). Sube el archivo descargado directamente del SAT.",
        });
      }
      if (
        !textoNormalizado.includes(rfcLimpio) ||
        !textoNormalizado.includes("CONSTANCIA DE SITUACION FISCAL")
      ) {
        return responderFalloPaso(res, {
          rfc: rfcLimpio,
          nombreComercial,
          paso: 1,
          esRojo: false,
          mensaje: `El documento cargado no corresponde a una Constancia de Situación Fiscal válida para el RFC ${rfcLimpio}.`,
        });
      }
      const esConstanciaFisica =
        textoNormalizado.includes("CURP") &&
        textoNormalizado.includes("PRIMER APELLIDO");
      const esConstanciaMoral = textoNormalizado.includes(
        "DENOMINACION RAZON SOCIAL"
      );
      if (tipo_persona === "MORAL" && esConstanciaFisica && !esConstanciaMoral) {
        return responderFalloPaso(res, {
          rfc: rfcLimpio,
          nombreComercial,
          paso: 1,
          esRojo: false,
          mensaje:
            "Seleccionaste Persona Moral, pero la Constancia adjunta pertenece a una Persona Física.",
        });
      }
      if (
        tipo_persona === "FISICA" &&
        esConstanciaMoral &&
        !esConstanciaFisica
      ) {
        return responderFalloPaso(res, {
          rfc: rfcLimpio,
          nombreComercial,
          paso: 1,
          esRojo: false,
          mensaje:
            "Seleccionaste Persona Física, pero la Constancia adjunta pertenece a una Persona Moral.",
        });
      }
      const cpFiscalLimpio = String(cp_fiscal).trim();
      if (
        !/^\d{5}$/.test(cpFiscalLimpio) ||
        !textoNormalizado.includes(cpFiscalLimpio)
      ) {
        return responderFalloPaso(res, {
          rfc: rfcLimpio,
          nombreComercial,
          paso: 1,
          esRojo: false,
          mensaje: `El Código Postal fiscal (${cpFiscalLimpio}) no coincide con el registrado en tu Constancia de Situación Fiscal.`,
        });
      }
      const palabrasCalleFiscal = normalizarTexto(calle_fiscal)
        .split(" ")
        .filter((w) => w.length >= 4);
      if (
        palabrasCalleFiscal.length > 0 &&
        !palabrasCalleFiscal.some((w) => textoNormalizado.includes(w))
      ) {
        return responderFalloPaso(res, {
          rfc: rfcLimpio,
          nombreComercial,
          paso: 1,
          esRojo: false,
          mensaje:
            "La calle del domicilio fiscal no coincide con la asentada en tu Constancia de Situación Fiscal.",
        });
      }
      // Cruce del Giro Comercial seleccionado contra "Actividades Económicas" de la Constancia SAT
      const nombreGiroSeleccionado = await obtenerNombreGiroPorId(id_giro);
      if (nombreGiroSeleccionado) {
        const idxActividades = textoNormalizado.indexOf("ACTIVIDADES ECONOMICAS");
        const textoActividades =
          idxActividades !== -1
            ? textoNormalizado.slice(idxActividades, idxActividades + 2000)
            : textoNormalizado;

        const stopWordsGiro = new Set([
          "COMERCIO", "SERVICIOS", "POR", "MENOR", "MAYOR", "PARA",
          "PRODUCTOS", "ARTICULOS", "EQUIPO", "OTROS", "GENERAL", "PRIVADA"
        ]);
        const palabrasClaveGiro = normalizarTexto(nombreGiroSeleccionado)
          .split(" ")
          .filter((w) => w.length >= 5 && !stopWordsGiro.has(w));

        if (
          palabrasClaveGiro.length > 0 &&
          !palabrasClaveGiro.some((palabra) => textoActividades.includes(palabra))
        ) {
          return responderFalloPaso(res, {
            rfc: rfcLimpio,
            nombreComercial,
            paso: 1,
            esRojo: false,
            mensaje: `El Giro Comercial seleccionado ("${nombreGiroSeleccionado}") no coincide con las Actividades Económicas registradas en tu Constancia de Situación Fiscal.`,
          });
        }
      }

      const contenidoQr = await leerQrDePdf(docCsf.buffer);
      const qrValido = contenidoQr
        ? validarUrlQrSat(contenidoQr, "CSF", rfcLimpio)
        : { valida: false };
      if (
        !qrValido.valida ||
        !textoNormalizado.includes(qrValido.idDocumento)
      ) {
        return responderFalloPaso(res, {
          rfc: rfcLimpio,
          nombreComercial,
          paso: 1,
          esRojo: false,
          mensaje:
            "El Código QR no apunta al validador oficial de Constancia SAT (siat.sat.gob.mx) o su idCIF/RFC no coincide con el documento.",
        });
      }
      const razonSocialExtraida = extraerNombreContribuyenteCsf(
        textoCrudo,
        tipo_persona
      );
      return res.json({
        paso: 1,
        estado: "VERDE",
        razon_social_sat: razonSocialExtraida,
        url_qr_csf: qrValido.urlLimpia,
        mensaje:
          "Paso 1 validado en Verde: Constancia SAT, idCIF, domicilio fiscal y QR verificados.",
      });
    }
    // PASO 2: ACTIVIDAD Y UBICACIÓN
    if (paso === 2) {
      const {
        cp_operaciones,
        calle_operaciones,
        numero_operaciones,
        id_alcaldia_operaciones,
        geolocalizado,
        lat,
        lon,
      } = req.body;
      if (
        !cp_operaciones ||
        !calle_operaciones ||
        !numero_operaciones ||
        !id_alcaldia_operaciones
      ) {
        return res
          .status(400)
          .json({ error: "Completa todos los campos del domicilio de operaciones." });
      }
      const cpLimpio = String(cp_operaciones).trim();
      if (!/^\d{5}$/.test(cpLimpio)) {
        return responderFalloPaso(res, {
          rfc: rfcLimpio,
          nombreComercial,
          paso: 2,
          esRojo: false,
          mensaje:
            "El Código Postal de operaciones debe tener exactamente 5 dígitos.",
        });
      }
      if (geolocalizado !== "true") {
        return res.status(400).json({
          error:
            'Presiona "Actualizar Mapa" para confirmar las coordenadas del domicilio antes de continuar.',
        });
      }
      const docComprobante = files.doc_comprobante?.[0];
      if (!docComprobante) {
        return res
          .status(400)
          .json({ error: "Debes adjuntar tu Comprobante de Domicilio en PDF." });
      }
      const compLeido = await leerPdfMemoria(docComprobante);
      if (compLeido.textoNormalizado.length < 60 || compLeido.fueManipulado) {
        return responderFalloPaso(res, {
          rfc: rfcLimpio,
          nombreComercial,
          paso: 2,
          esRojo: false,
          mensaje:
            "El Comprobante de Domicilio no es un recibo digital íntegro (parece escaneado o editado en Word/editor externo).",
        });
      }
      const tieneEmisorValido = EMISORES_COMPROBANTE.some((em) =>
        compLeido.textoNormalizado.includes(em)
      );
      if (!tieneEmisorValido) {
        return responderFalloPaso(res, {
          rfc: rfcLimpio,
          nombreComercial,
          paso: 2,
          esRojo: false,
          mensaje:
            "El documento adjunto no corresponde a un recibo oficial reconocido (CFE, SACMEX, Telmex, Izzi, Totalplay, Predial o Estado de Cuenta).",
        });
      }
      const palabrasCalle = normalizarTexto(calle_operaciones)
        .split(" ")
        .filter((w) => w.length >= 4);
      const coincideCp = compLeido.textoNormalizado.includes(cpLimpio);
      const coincideCalle =
        palabrasCalle.length === 0 ||
        palabrasCalle.some((w) => compLeido.textoNormalizado.includes(w));
      if (!coincideCp || !coincideCalle) {
        return responderFalloPaso(res, {
          rfc: rfcLimpio,
          nombreComercial,
          paso: 2,
          esRojo: false,
          mensaje: `El Comprobante de Domicilio debe coincidir tanto en la calle como en el Código Postal (${cpLimpio}) capturados.`,
        });
      }
      const denue = await consultarDenueInegi({
        nombreComercial,
        cp: cpLimpio,
        lat,
        lon,
      });
      return res.json({
        paso: 2,
        estado: "VERDE",
        validado_denue: Boolean(denue.coincide),
        mensaje: denue.coincide
          ? `Paso 2 validado en Verde + Establecimiento confirmado en DENUE INEGI (${denue.establecimiento}).`
          : "Paso 2 validado en Verde: Domicilio verificado contra mapa y recibo oficial.",
      });
    }
    // PASO 3: REPRESENTANTE LEGAL / TITULAR
    if (paso === 3) {
      const { nombre_completo, tipo_persona } = req.body;
      if (!nombre_completo || !curpLimpia) {
        return res.status(400).json({
          error:
            "Ingresa el nombre completo y la CURP del representante o titular.",
        });
      }
      const regexCurp =
        /^[A-Z][AEIOUX][A-Z]{2}\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])[HMX][A-Z]{2}[B-DF-HJ-NP-TV-Z]{3}[0-9A-Z]\d$/;
      if (!regexCurp.test(curpLimpia)) {
        return responderFalloPaso(res, {
          rfc: rfcLimpio,
          curp: curpLimpia,
          nombreComercial,
          paso: 3,
          esRojo: false,
          mensaje:
            "La CURP ingresada no cumple con la estructura oficial de 18 caracteres de RENAPO.",
        });
      }
      const curpExiste = await verificarCurpDuplicada(curpLimpia);
      if (curpExiste) {
        return responderFalloPaso(res, {
          rfc: rfcLimpio,
          curp: curpLimpia,
          nombreComercial,
          paso: 3,
          esRojo: true,
          mensaje:
            "Esta CURP ya se encuentra asociada a otra empresa registrada en WorkGuard.",
        });
      }
      const chequeoNegraCurp = await verificarListasNegras({ curp: curpLimpia });
      if (chequeoNegraCurp.enListaNegra) {
        return responderFalloPaso(res, {
          rfc: rfcLimpio,
          curp: curpLimpia,
          nombreComercial,
          paso: 3,
          esRojo: true,
          mensaje: chequeoNegraCurp.motivo,
        });
      }
      if (tipo_persona === "FISICA" && rfcLimpio.length === 13) {
        if (curpLimpia.slice(0, 10) !== rfcLimpio.slice(0, 10)) {
          return responderFalloPaso(res, {
            rfc: rfcLimpio,
            curp: curpLimpia,
            nombreComercial,
            paso: 3,
            esRojo: false,
            mensaje:
              "Para Persona Física, los primeros 10 caracteres de la CURP deben coincidir con el RFC.",
          });
        }
      }
      const docCurp = files.doc_curp?.[0];
      if (!docCurp) {
        return res.status(400).json({
          error: "Debes adjuntar la Constancia oficial de la CURP en PDF.",
        });
      }
      const curpPdf = await leerPdfMemoria(docCurp);
      if (curpPdf.textoNormalizado.length < 50 || curpPdf.fueManipulado) {
        return responderFalloPaso(res, {
          rfc: rfcLimpio,
          curp: curpLimpia,
          nombreComercial,
          paso: 3,
          esRojo: false,
          mensaje:
            "El PDF de la CURP parece escaneado o editado externamente. Descárgalo directamente de gob.mx/curp.",
        });
      }
      if (
        !curpPdf.textoNormalizado.includes(curpLimpia) ||
        !curpPdf.textoNormalizado.includes(
          "CLAVE UNICA DE REGISTRO DE POBLACION"
        )
      ) {
        return responderFalloPaso(res, {
          rfc: rfcLimpio,
          curp: curpLimpia,
          nombreComercial,
          paso: 3,
          esRojo: false,
          mensaje:
            "El PDF adjunto no corresponde a una Constancia oficial de CURP válida o la clave no coincide.",
        });
      }
      const qrCurp = await leerQrDePdf(docCurp.buffer);
      if (!qrCurp || !qrCurp.toUpperCase().includes(curpLimpia)) {
        return responderFalloPaso(res, {
          rfc: rfcLimpio,
          curp: curpLimpia,
          nombreComercial,
          paso: 3,
          esRojo: false,
          mensaje:
            "No se pudo verificar el Código QR oficial de RENAPO dentro de la Constancia de CURP.",
        });
      }
      const palabrasNombre = normalizarTexto(nombre_completo)
        .split(" ")
        .filter((w) => w.length >= 3);
      const coincidenciasNombreCurp = palabrasNombre.filter((w) =>
        curpPdf.textoNormalizado.includes(w)
      );
      if (
        palabrasNombre.length > 0 &&
        coincidenciasNombreCurp.length < Math.min(2, palabrasNombre.length)
      ) {
        return responderFalloPaso(res, {
          rfc: rfcLimpio,
          curp: curpLimpia,
          nombreComercial,
          paso: 3,
          esRojo: false,
          mensaje:
            "El nombre completo ingresado no coincide con el titular de la Constancia CURP.",
        });
      }
      const docCsf = files.doc_csf?.[0];
      if (tipo_persona === "FISICA" && docCsf) {
        const csfLeida = await leerPdfMemoria(docCsf);
        const coincideEnCsf = palabrasNombre.filter((w) =>
          csfLeida.textoNormalizado.includes(w)
        );
        if (coincideEnCsf.length < Math.min(2, palabrasNombre.length)) {
          return responderFalloPaso(res, {
            rfc: rfcLimpio,
            curp: curpLimpia,
            nombreComercial,
            paso: 3,
            esRojo: false,
            mensaje:
              "El nombre del titular no coincide con el registrado en la Constancia de Situación Fiscal del Paso 1.",
          });
        }
      }
      if (tipo_persona === "MORAL") {
        const docActa = files.doc_acta?.[0];
        if (!docActa) {
          return res.status(400).json({
            error:
              "Para Persona Moral debes adjuntar el Acta Constitutiva o Poder Notarial en PDF que acredite al Representante Legal.",
          });
        }
        const actaLeida = await leerPdfMemoria(docActa);
        if (actaLeida.textoNormalizado.length < 120) {
          return responderFalloPaso(res, {
            rfc: rfcLimpio,
            curp: curpLimpia,
            nombreComercial,
            paso: 3,
            esRojo: false,
            mensaje:
              "El PDF del Acta Constitutiva o Poder Notarial no contiene texto digital legible.",
          });
        }
        const tieneTerminosNotariales =
          (actaLeida.textoNormalizado.includes("NOTARIO") ||
            actaLeida.textoNormalizado.includes("ESCRITURA")) &&
          (actaLeida.textoNormalizado.includes("REPRESENTANTE") ||
            actaLeida.textoNormalizado.includes("ADMINISTRADOR") ||
            actaLeida.textoNormalizado.includes("APODERADO"));
        const coincideRepEnActa =
          palabrasNombre.filter((w) => actaLeida.textoNormalizado.includes(w))
            .length >= Math.min(2, palabrasNombre.length);
        if (!tieneTerminosNotariales || !coincideRepEnActa) {
          return responderFalloPaso(res, {
            rfc: rfcLimpio,
            curp: curpLimpia,
            nombreComercial,
            paso: 3,
            esRojo: false,
            mensaje:
              "No se pudo acreditar el nombramiento del Representante Legal dentro del Acta Constitutiva / Poder Notarial adjunto.",
          });
        }
        if (docCsf) {
          const csfLeida = await leerPdfMemoria(docCsf);
          const razonSat = extraerNombreContribuyenteCsf(
            csfLeida.textoCrudo,
            "MORAL"
          );
          const palabrasSociedad = razonSat
            .split(" ")
            .filter(
              (w) =>
                w.length >= 4 &&
                ![
                  "SOCIEDAD",
                  "ANONIMA",
                  "CAPITAL",
                  "VARIABLE",
                  "RESPONSABILIDAD",
                  "LIMITADA",
                ].includes(w)
            );
          if (
            palabrasSociedad.length > 0 &&
            !palabrasSociedad.some((w) => actaLeida.textoNormalizado.includes(w))
          ) {
            return responderFalloPaso(res, {
              rfc: rfcLimpio,
              curp: curpLimpia,
              nombreComercial,
              paso: 3,
              esRojo: false,
              mensaje:
                "La Denominación o Razón Social del Acta Constitutiva no coincide con la de la Constancia SAT.",
            });
          }
        }
      }
      return res.json({
        paso: 3,
        estado: "VERDE",
        mensaje:
          "Paso 3 validado en Verde: Identidad, QR RENAPO y vinculación legal verificadas.",
      });
    }
    // PASO 4: CUMPLIMIENTO Y TAMAÑO
    if (paso === 4) {
      const trabajadores = Number(req.body.numero_trabajadores);
      if (!trabajadores || trabajadores < 1) {
        return res.status(400).json({
          error: "Ingresa un número válido de trabajadores (mínimo 1).",
        });
      }
      if (trabajadores > 250) {
        return responderFalloPaso(res, {
          rfc: rfcLimpio,
          nombreComercial,
          paso: 4,
          esRojo: true,
          mensaje:
            "La empresa excede el límite de 250 trabajadores para clasificarse como MiPyME según el DOF.",
        });
      }
      const tamanoEtiqueta = calcularTamanoDOF(trabajadores);
      const idTamano = await obtenerIdTamanoPorEtiqueta(tamanoEtiqueta);
      const doc32d = files.doc_opinion_32d?.[0];
      if (!doc32d) {
        return res.status(400).json({
          error:
            "Debes adjuntar la Opinión del Cumplimiento de Obligaciones Fiscales (32-D) en PDF.",
        });
      }
      const { textoCrudo, textoNormalizado, esOficialSat, fueManipulado } =
        await leerPdfMemoria(doc32d);
      if (textoNormalizado.length < 60) {
        return responderFalloPaso(res, {
          rfc: rfcLimpio,
          nombreComercial,
          paso: 4,
          esRojo: false,
          mensaje:
            "El PDF de la Opinión 32-D no tiene texto legible. Descarga el documento original desde el portal del SAT.",
        });
      }
      if (fueManipulado || !esOficialSat) {
        return responderFalloPaso(res, {
          rfc: rfcLimpio,
          nombreComercial,
          paso: 4,
          esRojo: false,
          mensaje:
            "La Opinión 32-D no conserva la estructura digital oficial del SAT (parece editada o reimpresa desde Word/navegador).",
        });
      }
      if (
        !textoNormalizado.includes(rfcLimpio) ||
        !textoNormalizado.includes("OPINION DEL CUMPLIMIENTO")
      ) {
        return responderFalloPaso(res, {
          rfc: rfcLimpio,
          nombreComercial,
          paso: 4,
          esRojo: false,
          mensaje: `El documento adjunto no corresponde a una Opinión del Cumplimiento (32-D) válida para el RFC ${rfcLimpio}.`,
        });
      }
      if (
        textoNormalizado.includes("NEGATIVO") &&
        !textoNormalizado.includes("POSITIVO")
      ) {
        return responderFalloPaso(res, {
          rfc: rfcLimpio,
          nombreComercial,
          paso: 4,
          esRojo: true,
          mensaje:
            "La Opinión del Cumplimiento (32-D) reporta sentido NEGATIVO ante el SAT.",
        });
      }
      if (!textoNormalizado.includes("POSITIVO")) {
        return responderFalloPaso(res, {
          rfc: rfcLimpio,
          nombreComercial,
          paso: 4,
          esRojo: false,
          mensaje:
            "No se pudo confirmar el sentido POSITIVO en la Opinión del Cumplimiento 32-D.",
        });
      }
      const vigencia = verificarVigencia32D(textoCrudo);
      if (vigencia.verificada && !vigencia.vigente) {
        return responderFalloPaso(res, {
          rfc: rfcLimpio,
          nombreComercial,
          paso: 4,
          esRojo: false,
          mensaje:
            "La Opinión del Cumplimiento 32-D tiene más de 30 días de emisión. Descarga una opinión actualizada del portal del SAT.",
        });
      }
      const qr32d = await leerQrDePdf(doc32d.buffer);
      const qr32dValido = qr32d
        ? validarUrlQrSat(qr32d, "32D", rfcLimpio)
        : { valida: false };
      if (
        !qr32dValido.valida ||
        !textoNormalizado.includes(qr32dValido.idDocumento)
      ) {
        return responderFalloPaso(res, {
          rfc: rfcLimpio,
          nombreComercial,
          paso: 4,
          esRojo: false,
          mensaje:
            "El Código QR no apunta al validador oficial de Opinión 32-D del SAT o su Folio/RFC no coincide con el documento.",
        });
      }
      return res.json({
        paso: 4,
        estado: "VERDE",
        tamano_calculado: tamanoEtiqueta,
        id_tamano: idTamano,
        url_qr_32d: qr32dValido.urlLimpia,
        mensaje: `Paso 4 validado en Verde: Opinión 32-D POSITIVA verificada con SAT y tamaño clasificado como ${tamanoEtiqueta}.`,
      });
    }
  } catch (error) {
    console.error("Error al evaluar paso MiPyME:", error);
    return res
      .status(500)
      .json({ error: "Error interno al validar el paso." });
  }
}
// =============================================================================
// REGISTRO DEFINITIVO DE LA MIPYME (INICIA EN BORRADOR_PERFIL)
// =============================================================================
export async function registrarMipyme(req, res) {
  try {
    const datos =
      typeof req.body.payload === "string"
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
      validado_denue,
      url_qr_csf,
      url_qr_32d,
    } = datos;
    if (
      !usuario ||
      !contrasena ||
      !nombre_comercial ||
      !rfc ||
      !tipo_persona ||
      !representante?.curp ||
      !representante?.nombre_completo
    ) {
      return res
        .status(400)
        .json({ error: "Faltan datos obligatorios para completar el registro." });
    }
    const rfcLimpio = rfc.trim().toUpperCase();
    const curpLimpia = representante.curp.trim().toUpperCase();
    const usuarioLimpio = usuario.trim();
    const intentoPrevio = await obtenerIntentosRegistro(rfcLimpio, curpLimpia);
    if (intentoPrevio?.bloqueado) {
      return res.status(403).json({
        error:
          intentoPrevio.motivo_bloqueo ||
          "Este RFC/CURP se encuentra bloqueado para registro.",
      });
    }
    const chequeoNegra = await verificarListasNegras({
      rfc: rfcLimpio,
      curp: curpLimpia,
      nombreComercial: nombre_comercial,
    });
    if (chequeoNegra.enListaNegra) {
      return res.status(403).json({ error: chequeoNegra.motivo });
    }
    const [usuarioOcupado, dupPaso1, curpOcupada] = await Promise.all([
      verificarUsuarioDuplicado(usuarioLimpio),
      verificarDuplicadosPaso1(rfcLimpio, nombre_comercial.trim()),
      verificarCurpDuplicada(curpLimpia),
    ]);
    if (usuarioOcupado) {
      return res
        .status(409)
        .json({ error: "Ese nombre de usuario ya está ocupado en WorkGuard." });
    }
    if (dupPaso1.existeRfc) {
      return res
        .status(409)
        .json({ error: "Este RFC ya se encuentra registrado en WorkGuard." });
    }
    if (dupPaso1.existeNombre) {
      return res.status(409).json({
        error: "Este Nombre Comercial ya se encuentra registrado en WorkGuard.",
      });
    }
    if (curpOcupada) {
      return res.status(409).json({
        error: "Esta CURP ya está asociada a otra cuenta en WorkGuard.",
      });
    }
    const etiquetaDof = calcularTamanoDOF(numero_trabajadores) || "Micro";
    const idTamanoFinal =
      id_tamano || (await obtenerIdTamanoPorEtiqueta(etiquetaDof));
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
        curp: curpLimpia,
      },
      validado_denue: Boolean(validado_denue),
      url_qr_csf: url_qr_csf || null,
      url_qr_32d: url_qr_32d || null,
    });
    await limpiarIntentosRegistro(rfcLimpio);
    return res.status(201).json({
      mensaje:
        "¡Cuenta creada con éxito! Inicia sesión para personalizar tu tarjeta pública y enviarla a validación del Administrador.",
      mipyme: creada,
    });
  } catch (error) {
    console.error("Error al registrar MiPyME:", error);
    return res
      .status(500)
      .json({ error: "Error interno al guardar el registro de la MiPyME." });
  }
}
// =============================================================================
// GESTIÓN DE PERFIL Y FOTOS DE LA MIPYME LOGUEADA
// =============================================================================
export async function getMiPerfilMipyme(req, res) {
  try {
    const idMipyme = req.usuario.id;
    const empresa = await obtenerMipymePorId(idMipyme);
    if (!empresa) {
      return res.status(404).json({ error: "Perfil de MiPyME no encontrado." });
    }
    return res.json(empresa);
  } catch (error) {
    console.error("Error al obtener perfil propio de MiPyME:", error);
    return res
      .status(500)
      .json({ error: "Error al cargar el perfil de tu empresa." });
  }
}
export async function putMiPerfilMipyme(req, res) {
  try {
    const idMipyme = req.usuario.id;
    const {
      descripcion,
      pagina_web,
      facebook,
      instagram,
      twitter,
      enviar_a_revision,
    } = req.body;
    let nuevaLogoUrl = undefined;
    if (req.file) {
      const ext = req.file.originalname.split(".").pop() || "jpg";
      const ruta = `mipymes/logo_${idMipyme}_${Date.now()}.${ext}`;
      nuevaLogoUrl = await subirImagenStorage(
        "workguard_perfiles",
        ruta,
        req.file.buffer,
        req.file.mimetype
      );
    }
    const enviarBool =
      enviar_a_revision === true || enviar_a_revision === "true";
    if (enviarBool) {
      const actual = await obtenerMipymePorId(idMipyme);
      const descFinal =
        descripcion !== undefined ? descripcion.trim() : actual?.descripcion;
      if (!descFinal || descFinal.length < 15) {
        return res.status(400).json({
          error:
            "Escribe una descripción comercial de al menos 15 caracteres antes de enviar tu perfil a revisión.",
        });
      }
    }
    const actualizada = await actualizarPerfilMipyme(idMipyme, {
      descripcion: descripcion !== undefined ? descripcion.trim() : undefined,
      logo_url: nuevaLogoUrl,
      actividad: {
        pagina_web: pagina_web?.trim() || null,
        facebook: facebook?.trim() || null,
        instagram: instagram?.trim() || null,
        twitter: twitter?.trim() || null,
      },
      enviar_a_revision: enviarBool,
    });
    return res.json({
      mensaje: enviarBool
        ? "¡Perfil enviado a revisión oficial! Un Administrador validará tus datos para activar tu Sello WorkGuard."
        : "Cambios guardados en tu tarjeta pública.",
      mipyme: actualizada,
    });
  } catch (error) {
    console.error("Error al actualizar perfil de MiPyME:", error);
    return res
      .status(500)
      .json({ error: "Error al guardar los cambios del perfil." });
  }
}
export async function postFotoEstablecimiento(req, res) {
  try {
    const idMipyme = req.usuario.id;
    const orden = Number(req.body.orden);
    if (![1, 2, 3].includes(orden)) {
      return res
        .status(400)
        .json({ error: "El número de espacio de foto debe ser 1, 2 o 3." });
    }
    if (!req.file) {
      return res
        .status(400)
        .json({ error: "Selecciona una imagen válida (JPG, PNG o WEBP)." });
    }
    const ext = req.file.originalname.split(".").pop() || "jpg";
    const ruta = `mipyme_${idMipyme}/foto_${orden}_${Date.now()}.${ext}`;
    const urlPublica = await subirImagenStorage(
      "establecimientos_mipyme",
      ruta,
      req.file.buffer,
      req.file.mimetype
    );
    const fotoGuardada = await guardarFotoEstablecimiento(
      idMipyme,
      orden,
      urlPublica
    );
    return res.status(201).json({
      mensaje: `Fotografía ${orden} del establecimiento guardada.`,
      foto: fotoGuardada,
    });
  } catch (error) {
    console.error("Error al subir foto de establecimiento:", error);
    return res
      .status(500)
      .json({ error: "Error al subir la fotografía del establecimiento." });
  }
}
export async function deleteFotoEstablecimiento(req, res) {
  try {
    const idMipyme = req.usuario.id;
    const idFoto = Number(req.params.idFoto);
    await eliminarFotoEstablecimiento(idMipyme, idFoto);
    return res.json({ mensaje: "Fotografía eliminada correctamente." });
  } catch (error) {
    console.error("Error al eliminar foto de establecimiento:", error);
    return res
      .status(500)
      .json({ error: "Error al eliminar la fotografía." });
  }
}
// =============================================================================
// CONSULTA PÚBLICA (CONSULTOR) Y AUDITORÍA (ADMINISTRADOR)
// =============================================================================
export async function getMipymesPublicas(req, res) {
  try {
    const empresas = await listarMipymesAprobadas();
    return res.json(empresas);
  } catch (error) {
    console.error("Error al listar MiPyMEs:", error);
    return res
      .status(500)
      .json({ error: "Error al obtener el directorio de MiPyMEs." });
  }
}
export async function getDetalleMipyme(req, res) {
  try {
    const id = Number(req.params.id);
    const empresa = await obtenerMipymePorId(id);
    if (!empresa) {
      return res.status(404).json({ error: "MiPyME no encontrada." });
    }
    // Si es consultor, solo puede ver empresas con Sello WorkGuard APROBADO
    if (
      req.usuario.rol === "consultor" &&
      empresa.estatus_verificacion !== "APROBADA"
    ) {
      return res.status(403).json({
        error: "Esta empresa aún se encuentra en proceso de verificación.",
      });
    }
    // Ocultar CURP y URLs internas de QR al rol consultor
    if (req.usuario.rol === "consultor") {
      if (empresa.representante) delete empresa.representante.curp;
      if (empresa.existencia_fiscal) {
        delete empresa.existencia_fiscal.url_qr_csf;
        delete empresa.existencia_fiscal.url_qr_32d;
      }
    }
    return res.json(empresa);
  } catch (error) {
    console.error("Error al obtener detalle de MiPyME:", error);
    return res
      .status(500)
      .json({ error: "Error al obtener información de la MiPyME." });
  }
}
export async function getSolicitudesMipymeAdmin(req, res) {
  try {
    const solicitudes = await listarSolicitudesAdmin();
    return res.json(solicitudes);
  } catch (error) {
    console.error("Error al listar solicitudes de MiPyMEs:", error);
    return res
      .status(500)
      .json({ error: "Error al obtener las solicitudes de MiPyMEs." });
  }
}
export async function dictaminarMipyme(req, res) {
  try {
    const id = Number(req.params.id);
    const { aprobar, motivo_rechazo } = req.body;
    if (typeof aprobar !== "boolean") {
      return res.status(400).json({
        error:
          "Debes indicar si apruebas (true) o rechazas (false) la solicitud.",
      });
    }
    if (!aprobar && (!motivo_rechazo || motivo_rechazo.trim().length < 10)) {
      return res.status(400).json({
        error:
          "Escribe un motivo oficial de rechazo de al menos 10 caracteres.",
      });
    }
    const actualizada = await dictaminarSolicitudMipyme(id, {
      aprobar,
      motivo_rechazo: motivo_rechazo?.trim(),
    });
    if (!actualizada) {
      return res.status(404).json({ error: "MiPyME no encontrada." });
    }
    return res.json({
      mensaje: aprobar
        ? "MiPyME aprobada. Su Sello WorkGuard ya está activo y visible para los consultores."
        : "Solicitud rechazada y observaciones enviadas a la MiPyME.",
      mipyme: actualizada,
    });
  } catch (error) {
    console.error("Error al dictaminar MiPyME:", error);
    return res
      .status(500)
      .json({ error: "Error al procesar el dictamen de la MiPyME." });
  }
}

export async function getEfosSatAdmin(req, res) {
  try {
    const busqueda = typeof req.query.q === "string" ? req.query.q : "";
    const limite = Number(req.query.limit) || 15;
    const resultado = await listarEfosSatAdmin({ busqueda, limite });
    return res.json(resultado);
  } catch (error) {
    console.error("Error al consultar EFOS SAT:", error);
    return res.status(500).json({ error: "Error al cargar la lista EFOS del SAT." });
  }
}
