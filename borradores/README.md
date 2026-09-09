# Borradores

Esta carpeta es la bandeja de entrada del agente de investigación que corre en la nube (rutina programada en claude.ai, cada día ~7:00 hora de Madrid). Nada de lo que hay aquí se publica — está fuera de `src/content/`, así que Astro no la renderiza.

Cada mañana, si el agente encuentra alguna noticia que supera su filtro de veracidad (2+ fuentes independientes) y de relevancia, escribe un `.md` aquí y hace `commit` + `push` a `main` directamente desde la nube.

## Qué pasa después (fuera de este repo)

En el Mac, un script local (`sincronizar-borradores.sh`, gestionado por `launchd`) revisa esta carpeta cada mañana, copia lo nuevo a `~/Programas y proyectos/Activos/RedAgraria/Pendientes/` y envía un email de aviso. Desde ahí sigue el flujo normal de revisión humana: editar si hace falta, y mover a `Listo-para-publicar/` cuando esté aprobado, lo que dispara la publicación real (commit + push a `src/content/articulos/` + despliegue).

No es necesario tocar nada de esto manualmente en el día a día — solo revisar el correo cuando llega.
