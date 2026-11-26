import multer from 'multer';

const storage = multer.memoryStorage();

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // Máximo 5 MB por PDF
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Únicamente se permiten archivos oficiales en formato PDF.'), false);
    }
  }
});

export const subirDocumentosMipyme = upload.fields([
  { name: 'doc_csf', maxCount: 1 },
  { name: 'doc_comprobante', maxCount: 1 },
  { name: 'doc_curp', maxCount: 1 },
  { name: 'doc_acta', maxCount: 1 },
  { name: 'doc_opinion_32d', maxCount: 1 }
]);
