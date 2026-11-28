import { Router } from "express";
import multer from "multer";
import {
  getCatalogosMipyme,
  evaluarPasoMipyme,
  registrarMipyme,
  getMiPerfilMipyme,
  putMiPerfilMipyme,
  postFotoEstablecimiento,
  deleteFotoEstablecimiento,
  getMipymesPublicas,
  getDetalleMipyme,
  getSolicitudesMipymeAdmin,
  dictaminarMipyme,
  getEfosSatAdmin,
} from "../controllers/mipyme_controller.js";
import { subirDocumentosMipyme } from "../middlewares/upload_middleware.js";
import {
  requiereSesion,
  requiereRol,
} from "../middlewares/auth_middleware.js";

const router = Router();

// Memoria para imágenes del logo y establecimiento (máx 5 MB)
const uploadImagen = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const permitidos = ["image/jpeg", "image/png", "image/webp"];
    if (!permitidos.includes(file.mimetype)) {
      return cb(new Error("Solo se permiten imágenes JPG, PNG o WEBP."));
    }
    cb(null, true);
  },
});

// Registro público 
router.get("/catalogos", getCatalogosMipyme);
router.post("/evaluar-paso", subirDocumentosMipyme, evaluarPasoMipyme);
router.post("/registro", subirDocumentosMipyme, registrarMipyme);

// Gestión de perfil y fotos de la MiPyME autenticada
router.get("/mi-perfil", requiereSesion, requiereRol("mipyme"), getMiPerfilMipyme);
router.put("/mi-perfil",requiereSesion,requiereRol("mipyme"),uploadImagen.single("logo"), putMiPerfilMipyme);
router.post( "/mi-perfil/fotos", requiereSesion,  requiereRol("mipyme"), uploadImagen.single("foto"), postFotoEstablecimiento);
router.delete("/mi-perfil/fotos/:idFoto",requiereSesion,requiereRol("mipyme"),deleteFotoEstablecimiento);

// Gestion del Administrador
router.get("/admin/solicitudes", requiereSesion, requiereRol("admin"), getSolicitudesMipymeAdmin);
router.get("/admin/efos", requiereSesion, requiereRol("admin"), getEfosSatAdmin);
router.put("/admin/:id/dictamen", requiereSesion, requiereRol("admin"), dictaminarMipyme);

// Obtencion de la empresa
router.get("/", requiereSesion, getMipymesPublicas);
router.get("/:id",requiereSesion,requiereRol("admin", "consultor"),getDetalleMipyme);

export default router;