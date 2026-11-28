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

//Una configuración para los archivos de los reportes
const uploadReporte = multer({
    storage: multer.memoryStorage(),
    fileFilter:(req, file, cb) => {
        if(
            file.mimetype === 'application/pdf' &&
            file.originalname.toLowerCase().endsWith('.pdf')
        ){
            cb(null, true); 
        }else{
            cb(new Error('El archivo debe de ser un documento PDF'), false); 
        }
    },
    limits: {
        fileSize: 5 * 1024 * 1024,
        files: 1
    }
}); 

//Luego recibe un solopdf como la evidencia dle reporte
export const subirArchivoreporte = uploadReporte.single('archivo'); 
