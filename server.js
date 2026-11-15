import 'dotenv/config';
import { crearApp } from './app.js';

const PORT = process.env.PORT || 3001;

const app = crearApp({
    maxAge: 1000 * 60 * 60 * 8,
    rolling: true
});

app.listen(PORT, () => {
    console.log(`Servidor WorkGuard corriendo en el puerto ${PORT}`);
});
