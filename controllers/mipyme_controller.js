import bcrypt from "bcryptjs";
import { createRequire } from "module";
import {
  obtenerCatalogosRegistro,
  verificarDuplicadosRegistro,
  crearRegistroMipymeCompleto,
  listarMipymesAprobadas,
  listarMipymesParaAdmin,
  obtenerMipymePorId,
  actualizarDictamenAdmin,
} from "../modules/mipyme_module.js";

const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse");

// Dataset local de RFCs EFOS + RFCs de prueba para demostración
const LISTA_EFOS_SAT = new Set([
  "EFO010101AAA",
  "FAN990909XXX",
  "SIM850505123",
  "OPF120304ABC",
]);

// Programas de edicion para verificar alguna alteracion
const EDITORES_SOSPECHOSOS = [
  "photoshop",
  "canva",
  "ilovepdf",
  "pdfescape",
  "word",
  "coreldraw",
  "illustrator",
];

// Analiza los documetnos y los verifica
async function analizarDocumentoPdf(archivoObj, opciones = {}) {
  if (!archivoObj) {
    return {
      estado: "NARANJA",
      mensaje:
        "No se adjuntó archivo; requiere revisión manual del administrador.",
    };
  }

  if (archivoObj.mimetype !== "application/pdf") {
    return {
      estado: "NARANJA",
      mensaje:
        "Se subió una imagen en lugar de PDF digital oficial; requiere revisión manual.",
    };
  }

  try {
    const parsed = await pdfParse(archivoObj.buffer);
    const texto = (parsed.text || "").toUpperCase();
    const creador =
      `${parsed.info?.Creator || ""} ${parsed.info?.Producer || ""}`.toLowerCase();

    // Si no tien texto escaneable (no es un pdf normal)
    if (texto.trim().length < 40) {
      return {
        estado: "NARANJA",
        mensaje:
          "El PDF parece escaneado (sin texto digital seleccionable). Se recomienda subir el PDF original descargado del portal oficial; queda sujeto a revisión manual.",
      };
    }

    // Verfica alteracion manual
    const fueEditado = EDITORES_SOSPECHOSOS.some((tool) =>
      creador.includes(tool),
    );
    if (fueEditado) {
      return {
        estado: "NARANJA",
        mensaje:
          "Parece que hubo alguna edición externa. Requiere verificación manual del administrador.",
      };
    }

    // Comprueba estructura oficial del SAT, Sello Digital/Cadena Original
    if (opciones.esSat) {
      const tieneEstructuraSat =
        texto.includes("SAT") ||
        texto.includes("SERVICIO DE ADMINISTRACION TRIBUTARIA") ||
        texto.includes("SERVICIO DE ADMINISTRACIÓN TRIBUTARIA") ||
        texto.includes("SELLO DIGITAL") ||
        texto.includes("CADENA ORIGINAL");

      if (!tieneEstructuraSat) {
        return {
          estado: "NARANJA",
          mensaje:
            "El PDF no contiene los encabezados o cadenas digitales oficiales del SAT. Sube el PDF original descargado del SAT o espera revisión.",
        };
      }
    }

    // Coincidencia con los datos ingresados
    if (
      opciones.rfcEsperado &&
      !texto.includes(opciones.rfcEsperado.toUpperCase())
    ) {
      return {
        estado: "NARANJA",
        mensaje: `El RFC ingresado (${opciones.rfcEsperado}) no se encuentra dentro del PDF; pasará a revisión manual.`,
      };
    }

    if (opciones.cpEsperado && !texto.includes(opciones.cpEsperado)) {
      return {
        estado: "NARANJA",
        mensaje: `El Código Postal (${opciones.cpEsperado}) no coincidió automáticamente con el comprobante; pasará a revisión manual.`,
      };
    }

    if (opciones.validar32D) {
      if (texto.includes("NEGATIVO")) {
        return {
          estado: "NARANJA",
          mensaje:
            "La Opinión 32-D reporta sentido NEGATIVO ante el SAT; requiere evaluación del administrador.",
        };
      }
      if (!texto.includes("POSITIVO")) {
        return {
          estado: "NARANJA",
          mensaje:
            "No se pudo confirmar el sentido POSITIVO en la Opinión 32-D; pasará a revisión manual.",
        };
      }
    }

    return {
      estado: "VERDE",
      mensaje: "Documento digital auténtico y datos validados correctamente.",
    };
  } catch (err) {
    return {
      estado: "NARANJA",
      mensaje:
        "No fue posible procesar el PDF; queda pendiente de revisión manual.",
    };
  }
}

// Obtener los catalagos del registro
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

/// REGISTRO DE LA MIPYME//

export async function evaluarPasoMipyme(req, res) {
  try {
    const paso = Number(req.body.paso);
    const files = req.files || {};

    // PASO 1: Existencia Fiscal + CSF
    if (paso === 1) {
      const {
        tipo_persona,
        nombre_comercial,
        representante_legal,
        rfc,
        id_giro,
        cp_fiscal,
      } = req.body;
      const rfcLimpio = (rfc || "").trim().toUpperCase();

      if (
        !tipo_persona ||
        !nombre_comercial ||
        !representante_legal ||
        !rfcLimpio ||
        !id_giro
      ) {
        return res
          .status(400)
          .json({
            error: "Completa todos los campos obligatorios del Paso 1.",
          });
      }

      // Bloqueo inmediato si figura en EFOS (Art. 69-B)
      if (LISTA_EFOS_SAT.has(rfcLimpio)) {
        return res.status(403).json({
          estado: "ROJO",
          error:
            "Registro bloqueado: el RFC figura en el listado definitivo de EFOS (Art. 69-B del SAT).",
        });
      }

      // Validar RFC
      const regexMoral = /^[A-ZÑ&]{3}\d{6}[A-Z0-9]{3}$/;
      const regexFisica = /^[A-ZÑ&]{4}\d{6}[A-Z0-9]{3}$/;
      const rfcValido =
        tipo_persona === "MORAL"
          ? regexMoral.test(rfcLimpio)
          : regexFisica.test(rfcLimpio);

      if (!rfcValido) {
        return res.status(400).json({
          estado: "ROJO",
          error: `Formato de RFC inválido para Persona ${tipo_persona === "MORAL" ? "Moral (12 caracteres)" : "Física (13 caracteres)"}.`,
        });
      }

      const resultadoPdf = await analizarDocumentoPdf(files.doc_csf?.[0], {
        esSat: true,
        rfcEsperado: rfcLimpio,
      });

      return res.json({
        paso: 1,
        estado: resultadoPdf.estado,
        mensaje: resultadoPdf.mensaje,
      });
    }

    // PASO 2: Actividad y Ubicacion
    if (paso === 2) {
      const {
        tipo_persona,
        cp_operaciones,
        calle_operaciones,
        numero_operaciones,
        geolocalizado,
      } = req.body;

      if (!cp_operaciones || !calle_operaciones || !numero_operaciones) {
        return res
          .status(400)
          .json({ error: "Completa el domicilio de operaciones." });
      }

      const resComprobante = await analizarDocumentoPdf(
        files.doc_comprobante?.[0],
        {
          cpEsperado: cp_operaciones.trim(),
        },
      );

      let estadoPaso = resComprobante.estado;
      let mensajePaso = resComprobante.mensaje;

      if (tipo_persona === "MORAL") {
        const resActa = await analizarDocumentoPdf(files.doc_acta?.[0], {});
        if (resActa.estado === "NARANJA") {
          estadoPaso = "NARANJA";
          mensajePaso = `Acta Constitutiva: ${resActa.mensaje}`;
        }
      }

      if (geolocalizado !== "true" && estadoPaso === "VERDE") {
        estadoPaso = "NARANJA";
        mensajePaso =
          "El domicilio no pudo confirmarse exactamente en el mapa de CDMX; requiere revisión manual.";
      }

      return res.json({ paso: 2, estado: estadoPaso, mensaje: mensajePaso });
    }

    // PASO 3: Represente y CURP
    if (paso === 3) {
      const { curp, tipo_persona, rfc } = req.body;
      const curpLimpia = (curp || "").trim().toUpperCase();
      const regexCurp =
        /^[A-Z][AEIOUX][A-Z]{2}\d{2}(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])[HM](AS|BC|BS|CC|CL|CM|CS|CH|DF|DG|GT|GR|HG|JC|MC|MN|MS|NT|NL|OC|PL|QT|QR|SP|SL|SR|TC|TS|TL|VZ|YN|ZS|NE)[B-DF-HJ-NP-TV-Z]{3}[0-9A-Z]\d$/;

      if (!regexCurp.test(curpLimpia)) {
        return res.status(400).json({
          estado: "ROJO",
          error:
            "La CURP ingresada no cumple con la estructura oficial de 18 caracteres de RENAPO.",
        });
      }

      // Si es Persona Física, las primeras 10 posiciones del CURP y RFC deben coincidir
      if (
        tipo_persona === "FISICA" &&
        rfc &&
        curpLimpia.slice(0, 10) !== rfc.trim().toUpperCase().slice(0, 10)
      ) {
        return res.status(400).json({
          estado: "ROJO",
          error:
            "Los datos de nacimiento/nombre de la CURP no coinciden con el RFC de Persona Física.",
        });
      }
      const resAcred = await analizarDocumentoPdf(
        files.doc_acreditacion?.[0],
        {},
      );
      return res.json({
        paso: 3,
        estado: resAcred.estado,
        mensaje:
          resAcred.estado === "VERDE"
            ? "CURP válida y documento de acreditación verificado."
            : resAcred.mensaje,
      });
    }

    // PASO 4: Tamaño de la Empresa e Irregularidades fiscales con Opinión 32-D y Estratificación DOF 2009
    if (paso === 4) { 
      const { numero_trabajadores, rfc } = req.body;
      const trabajadores = Number(numero_trabajadores);
      if (!trabajadores || trabajadores < 1) {
        return res
          .status(400)
          .json({
            error: "Ingresa un número válido de trabajadores (mínimo 1).",
          });
      }
      if (trabajadores > 250) {
        return res.status(403).json({
          estado: "ROJO",
          error:
            "La empresa excede el límite de 250 trabajadores para ser considerada MiPyME según el DOF.",
        });
      }
      const res32D = await analizarDocumentoPdf(files.doc_opinion_32d?.[0], {
        esSat: true,
        rfcEsperado: (rfc || "").trim().toUpperCase(),
        validar32D: true,
      });

      // Clasificación oficial por rango de trabajadores
      let tamanoSugerido = "Microempresa";
      if (trabajadores >= 11 && trabajadores <= 50)
        tamanoSugerido = "Pequeña empresa";
      if (trabajadores >= 51 && trabajadores <= 250)
        tamanoSugerido = "Mediana empresa";
      return res.json({
        paso: 4,
        estado: res32D.estado,
        tamano_calculado: tamanoSugerido,
        mensaje: res32D.mensaje,
      });
    }
    return res.status(400).json({ error: "Número de paso no válido." });
  } catch (error) {
    console.error("Error al evaluar paso MiPyME:", error);
    return res.status(500).json({ error: "Error interno al validar el paso." });
  }
}



// Registrar MiPyme al COMPLETAR LOS PASOS 
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
      resultados_pasos,
    } = datos;
    if (!usuario || !contrasena || !nombre_comercial || !rfc || !tipo_persona) {
      return res
        .status(400)
        .json({
          error: "Faltan datos obligatorios para completar el registro.",
        });
    }
    const rfcLimpio = rfc.trim().toUpperCase();
    if (LISTA_EFOS_SAT.has(rfcLimpio)) {
      return res
        .status(403)
        .json({
          error:
            "No es posible registrar una empresa incluida en el listado EFOS del SAT.",
        });
    }
    const dup = await verificarDuplicadosRegistro(usuario.trim(), rfcLimpio);
    if (dup.duplicado) {
      return res.status(409).json({ error: dup.mensaje });
    }

    // Si algún paso quedó en Naranja poner advertencia transparente
    const pasosObj = resultados_pasos || {};
    const tieneNaranjas = Object.values(pasosObj).some(
      (p) => p?.estado === "NARANJA",
    );
    const mensajePyme = tieneNaranjas
      ? "Tu cuenta fue creada, pero tienes indicadores en NARANJA. Mientras un Administrador revisa tu caso, tu empresa NO será visible para los consultores ni tendrá el Sello WorkGuard. Te recomendamos tener listos tus PDFs originales descargados del portal del SAT para agilizar la validación."
      : "Todos tus indicadores automáticos salieron en VERDE. Tu solicitud pasó a revisión final del Administrador para activar tu Sello WorkGuard y hacer visible tu perfil a los consultores.";
    const dictamenVerificacion = {
      estatus: "PENDIENTE_REVISION",
      sello_aprobado: false,
      tiene_alertas_naranja: tieneNaranjas,
      motivo_rechazo: null,
      mensaje_pyme: mensajePyme,
      pasos: pasosObj,
      fecha_registro: new Date().toISOString(),
    };
    const contrasenaHash = await bcrypt.hash(contrasena, 10);
    const creada = await crearRegistroMipymeCompleto({
      usuario: usuario.trim(),
      contrasena_hash: contrasenaHash,
      nombre_comercial: nombre_comercial.trim(),
      tipo_persona,
      rfc: rfcLimpio,
      id_giro,
      numero_trabajadores,
      id_tamano,
      domicilio_fiscal,
      domicilio_operaciones,
      actividad: actividad || {},
      representante: {
        nombre_completo: representante.nombre_completo.trim(),
        curp: representante.curp.trim().toUpperCase(),
      },
      dictamen_verificacion: dictamenVerificacion,
    });
    return res.status(201).json({
      mensaje: "Registro de MiPyME completado.",
      mipyme: creada,
      advertencia_naranja: tieneNaranjas,
      detalle_estatus: mensajePyme,
    });
  } catch (error) {
    console.error("Error al registrar MiPyME:", error);
    return res
      .status(500)
      .json({ error: "Error interno al guardar el registro de la MiPyME." });
  }
}

// listar solo empresas aprobadas Consultor
export async function getMipymesPublicas(req, res) {
  try {
    const empresas = await listarMipymesAprobadas();
    return res.json(empresas);
  } catch (error) {
    console.error("Error al listar MiPyMEs aprobadas:", error);
    return res
      .status(500)
      .json({ error: "Error al obtener el directorio de MiPyMEs." });
  }
}
// Listado completo para el Admin
export async function getSolicitudesMipymeAdmin(req, res) {
  try {
    const empresas = await listarMipymesParaAdmin();
    return res.json(empresas);
  } catch (error) {
    console.error("Error al listar solicitudes MiPyME para admin:", error);
    return res
      .status(500)
      .json({ error: "Error al obtener las solicitudes de MiPyMEs." });
  }
}

// Obtener detalle de un Empresa
export async function getDetalleMipyme(req, res) {
  try {
    const id = Number(req.params.id);
    const empresa = await obtenerMipymePorId(id);
    if (!empresa) {
      return res.status(404).json({ error: "MiPyME no encontrada." });
    }

    // Bloqueamos empresas no aprobadas a los consultores 
    if (
      req.usuario.rol === "consultor" &&
      !empresa.dictamen_verificacion?.sello_aprobado
    ) {
      return res
        .status(403)
        .json({
          error: "Esta empresa aún se encuentra en proceso de verificación.",
        });
    }
    return res.json(empresa);
  } catch (error) {
    console.error("Error al obtener detalle de MiPyME:", error);
    return res
      .status(500)
      .json({ error: "Error al obtener información de la MiPyME." });
  }
}

// Gestionar el registro de las Pymes 
export async function dictaminarMipyme(req, res) {
  try {
    const id = Number(req.params.id);
    const { aprobar, motivo_rechazo } = req.body;
    if (typeof aprobar !== "boolean") {
      return res
        .status(400)
        .json({
          error:
            "Debes indicar si apruebas (true) o rechazas (false) la solicitud.",
        });
    }
    if (!aprobar && (!motivo_rechazo || !motivo_rechazo.trim())) {
      return res
        .status(400)
        .json({
          error:
            "Debes escribir el motivo oficial por el cual se rechaza la solicitud.",
        });
    }
    const actualizada = await actualizarDictamenAdmin(id, {
      aprobar,
      motivo_rechazo: motivo_rechazo?.trim(),
    });
    if (!actualizada) {
      return res.status(404).json({ error: "MiPyME no encontrada." });
    }
    return res.json({
      mensaje: aprobar
        ? "MiPyME aprobada. Ahora cuenta con Sello WorkGuard y es visible para los consultores."
        : "Solicitud rechazada y motivo notificado a la MiPyME.",
      mipyme: actualizada,
    });
  } catch (error) {
    console.error("Error al dictaminar MiPyME:", error);
    return res
      .status(500)
      .json({ error: "Error al actualizar el dictamen de la MiPyME." });
  }
}

