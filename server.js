import 'dotenv/config';
import { crearApp } from './app.js';

const PORT = process.env.PORT || 3001;
const app = crearApp();

app.listen(PORT, () => {
    console.log(`Servidor WorkGuard corriendo en el puerto ${PORT}`);
});
