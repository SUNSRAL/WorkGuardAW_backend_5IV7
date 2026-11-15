// Centro de Reportes del administrador.
// Consulta /api/admin/reportes cada pocos segundos y dibuja una tarjeta por reporte.
(function () {
    const INTERVALO_MS = 5000;   // cada cuánto se revisa si hay reportes nuevos
    const MAX_CARACTERES = 140;  // longitud del extracto del motivo en la tarjeta

    const lista = document.getElementById('listaReportes');
    const contador = document.getElementById('contadorNuevos');

    function crear(etiqueta, clase, texto) {
        const el = document.createElement(etiqueta);
        if (clase) el.className = clase;
        if (texto !== undefined) el.textContent = texto; // textContent: el texto del consultor nunca se interpreta como HTML
        return el;
    }

    function extracto(texto) {
        const limpio = String(texto).replace(/\s+/g, ' ').trim();
        return limpio.length > MAX_CARACTERES ? limpio.slice(0, MAX_CARACTERES).trimEnd() + '...' : limpio;
    }

    function crearTarjeta(reporte) {
        const tarjeta = crear('div', 'report-item-card');

        // Parte superior: avatar + usuario que envió el reporte + punto de "nuevo"
        const superior = crear('div', 'report-card-top');
        const usuario = crear('div', 'user-info');
        const avatar = crear('img', 'user-avatar');
        avatar.src = `/reportes/img/usuario${(reporte.id_consultor % 3) + 1}.png`;
        avatar.alt = `Avatar ${reporte.consultor_usuario}`;
        usuario.append(avatar, crear('span', 'username', reporte.consultor_usuario));
        superior.append(usuario);
        if (reporte.estado === 'PENDIENTE') {
            superior.append(crear('span', 'status-dot'));
        }

        // Cuerpo: empresa, extracto del motivo y botón de detalle
        const cuerpo = crear('div', 'report-card-body');
        const boton = crear('a', 'btn-detalle', 'Revisar Detalle >');
        boton.href = `/admin/reportes/detalle?id=${encodeURIComponent(reporte.id_reporte)}`;
        cuerpo.append(
            crear('div', 'company-tag', `🏢 Empresa: ${reporte.nombre_comercial}`),
            crear('p', 'report-text', extracto(reporte.descripcion)),
            boton
        );

        tarjeta.append(superior, cuerpo);
        return tarjeta;
    }

    function dibujar(datos) {
        contador.textContent = `${datos.nuevos} ${datos.nuevos === 1 ? 'Nuevo' : 'Nuevos'}`;
        lista.replaceChildren();
        if (datos.reportes.length === 0) {
            lista.append(crear('p', 'report-text', 'Todavía no hay reportes.'));
            return;
        }
        datos.reportes.forEach(r => lista.append(crearTarjeta(r)));
    }

    async function cargarReportes() {
        try {
            const respuesta = await fetch('/api/admin/reportes', { cache: 'no-store' });
            if (respuesta.status === 401) { window.location.href = '/login'; return; }
            if (!respuesta.ok) throw new Error('Respuesta no válida del servidor');
            dibujar(await respuesta.json());
        } catch (error) {
            // Si falla una consulta se conserva lo que ya se muestra; solo se avisa si aún no hay nada
            if (!lista.querySelector('.report-item-card')) {
                lista.replaceChildren(crear('p', 'report-text', 'No se pudieron cargar los reportes. Reintentando...'));
            }
        }
    }

    cargarReportes();
    setInterval(() => {
        if (!document.hidden) cargarReportes(); // no consulta si la pestaña está en segundo plano
    }, INTERVALO_MS);
})();