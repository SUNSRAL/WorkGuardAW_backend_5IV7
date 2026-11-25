import multer from 'multer';

// Almacena solo en ram momentaneamente
const storage = multer.memoryStorage();

//Solo pdf, e imagenes
const filtroArchivos = (req, file, cb) => {
    const permitidos = ['application/pdf', 'image/jpeg', 'image/png'];
    if (permitidos.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Formato no válido. Solo se permiten archivos PDF, JPG o PNG.'), false);
    }
};

const upload = multer({
    storage,
    fileFilter: filtroArchivos,
    limits: {
        fileSize: 5 * 1024 * 1024 // Máximo 5 MB por documento
    }
});

// Recibe los 4 documentos del registro MiPyME
export const subirDocumentosMipyme = upload.fields([
    { name: 'doc_csf', maxCount: 1 },            // Constancia de Situación Fiscal
    { name: 'doc_acta', maxCount: 1 },           // Acta Constitutiva (Persona Moral)
    { name: 'doc_comprobante', maxCount: 1 },    // Comprobante de Domicilio
    { name: 'doc_acreditacion', maxCount: 1 },   // Acreditación de Representante
    { name: 'doc_opinion_32d', maxCount: 1 }     // Opinión de Cumplimiento 32-D
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
