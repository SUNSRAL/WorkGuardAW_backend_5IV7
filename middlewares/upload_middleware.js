import multer from 'multer';

// Almacena los archivos exclusivamente en memoria RAM por unos milisegundos
const storage = multer.memoryStorage();

// Solo se aceptan documentos PDF oficiales
const filtroArchivos = (req, file, cb) => {
  if (file.mimetype === 'application/pdf') {
    cb(null, true);
  } else {
    cb(new Error('Formato no válido. Únicamente se permiten archivos PDF.'), false);
  }
};

const upload = multer({
  storage,
  fileFilter: filtroArchivos,
  limits: {
    fileSize: 5 * 1024 * 1024 // Máximo 5 MB por PDF
  }
});

// Recibe los 4 documentos oficiales del flujo de registro MiPyME
export const subirDocumentosMipyme = upload.fields([
  { name: 'doc_csf', maxCount: 1 },          // Paso 1: Constancia de Situación Fiscal
  { name: 'doc_comprobante', maxCount: 1 },  // Paso 2: Comprobante de Domicilio
  { name: 'doc_curp', maxCount: 1 },         // Paso 3: Constancia oficial de la CURP
  { name: 'doc_opinion_32d', maxCount: 1 }   // Paso 4: Opinión del Cumplimiento 32-D
]);
