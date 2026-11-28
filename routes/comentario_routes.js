import { Router } from "express";
import { requiereSesion, requiereRol } from "../middlewares/auth_middleware.js";
import {
  getComentariosMipyme,
  postComentarioMipyme,
  postLikeComentario,
} from "../controllers/comentario_controller.js";

const router = Router();

router.get("/mipyme/:id", requiereSesion, getComentariosMipyme);
router.post("/mipyme/:id", requiereSesion, requiereRol("consultor"), postComentarioMipyme);
router.post("/:idComentario/like", requiereSesion, requiereRol("consultor"), postLikeComentario);

export default router;