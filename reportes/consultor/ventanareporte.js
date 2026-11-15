// Lógica de la tarjeta de la MiPyME y de la ventana emergente (modal) de reporte.
// La página se abre con el id de la MiPyME en la URL: /consultor/dashboard?id=3
document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('reportModal');
    const btnReportar = document.getElementById('btnReportarMiPyMe');
    const btnEnviar = document.getElementById('btnEnviarReporte');
    const selectMotivo = document.getElementById('motivoReporte');
    const textareaDescripcion = document.getElementById('descripcionReporte');
    const mensaje = document.getElementById('mensajeReporte');
    const tituloMipyme = document.getElementById('nombreMipyme');

    const idMipyme = Number.parseInt(new URLSearchParams(window.location.search).get('id'), 10);

    function mostrarMensaje(texto) {
        mensaje.textContent = texto;
    }

    // --- Cargar el nombre de la MiPyME desde la base de datos ---
    async function cargarMipyme() {
        if (!Number.isInteger(idMipyme)) {
            tituloMipyme.textContent = 'MiPyME no indicada';
            btnReportar.disabled = true;
            return;
        }
        try {
            const respuesta = await fetch(`/api/mipymes/${idMipyme}`);
            if (respuesta.status === 401) { window.location.href = '/login'; return; }
            const datos = await respuesta.json();
            if (!respuesta.ok) throw new Error(datos.error || 'No se pudo cargar la MiPyME.');
            tituloMipyme.textContent = datos.nombre_comercial; // textContent evita inyectar HTML
        } catch (error) {
            tituloMipyme.textContent = 'No se pudo cargar la MiPyME';
            btnReportar.disabled = true;
        }
    }

    // --- Abrir / cerrar el modal ---
    window.abrirModal = function () {
        mostrarMensaje('');
        modal.style.display = 'flex';
    };

    window.cerrarModal = function () {
        modal.style.display = 'none';
        selectMotivo.value = '';
        textareaDescripcion.value = '';
        mostrarMensaje('');
    };

    // --- Enviar el reporte al servidor ---
    window.enviarReporte = async function () {
        const motivo = selectMotivo.value;
        const descripcion = textareaDescripcion.value.trim();

        if (motivo === '') {
            mostrarMensaje('Selecciona un motivo.');
            return;
        }
        if (descripcion === '') {
            mostrarMensaje('Escribe la descripción del reporte.');
            return;
        }

        btnEnviar.disabled = true; // evita enviar el mismo reporte dos veces con doble clic
        mostrarMensaje('');
        try {
            const respuesta = await fetch('/api/reportes', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id_mipyme: idMipyme, motivo, descripcion })
            });
            if (respuesta.status === 401) { window.location.href = '/login'; return; }
            const datos = await respuesta.json();
            if (!respuesta.ok) throw new Error(datos.error || 'No se pudo enviar el reporte.');

            cerrarModal();
            alert('Reporte enviado con éxito al administrador.');
        } catch (error) {
            mostrarMensaje(error.message);
        } finally {
            btnEnviar.disabled = false;
        }
    };

    // Cerrar el modal si hacen clic fuera de la caja blanca
    window.addEventListener('click', (event) => {
        if (event.target === modal) cerrarModal();
    });

    cargarMipyme();
});