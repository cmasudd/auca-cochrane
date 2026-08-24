# Operación del publicador AUCA Cochrane

Estado comprobado: 2026-08-24, zona horaria `America/Santiago`.

## Referencias

| Elemento | Valor |
|---|---|
| Repositorio | `https://github.com/cmasudd/auca-cochrane` |
| Sitio | `https://cmasudd.github.io/auca-cochrane/` |
| Rama | `main` |
| Commit inicial | `576691e3d4d2020ec27d6678f241e6c0dfcb200f` |
| Primera ejecución manual | `e1396dc0da8b22546a7eb7bc65e604a8602e218b` |
| Prueba con la línea exacta de cron | `67079445fb2030217d7aa4f78b9e49df99407d42` |
| Pages inicial | ejecución `32774262774`, correcta |

## Diseño

- Edición humana: `/home/cmas/Documentos/auca-cochrane`.
- Publicador: `/home/cmas/servicios/auca-cochrane-publisher`.
- Python: entorno actualmente comprobado del API; migrable a un entorno propio.
- MariaDB: conexión local mediante archivo protegido, nunca versionado.
- Frecuencia: minuto 17 de cada hora.
- Lock: `/tmp/auca-cochrane-update.lock`.
- Log: `data-update.log` dentro del clon exclusivo, ignorado por Git.

Tarea instalada:

```cron
17 * * * * /usr/bin/flock -n /tmp/auca-cochrane-update.lock /home/cmas/servicios/auca-cochrane-publisher/scripts/update_data.sh >> /home/cmas/servicios/auca-cochrane-publisher/data-update.log 2>&1
```

El crontab anterior está respaldado con permiso `0600` en:

```text
/home/cmas/backups/auca-cochrane-cron-before-2026-08-24/crontab.cmas
```

## Comprobaciones

```bash
systemctl is-active cron
crontab -l | grep auca-cochrane
tail -n 50 /home/cmas/servicios/auca-cochrane-publisher/data-update.log
git -C /home/cmas/servicios/auca-cochrane-publisher status --short --branch
git -C /home/cmas/servicios/auca-cochrane-publisher log -5 --oneline
```

Si no ingresaron datos nuevos, una ejecución correcta puede no crear commit.
El log debe terminar con validación correcta y un `push` correcto o indicar que
la rama ya estaba actualizada.

## Pruebas realizadas

- Perfil de variables por dispositivo, sensor y variable.
- Backfill completo: 257.526 mediciones procesadas para julio y agosto.
- Validación de manifiesto, `latest.csv`, encabezados, fechas, orden y tamaño.
- Cinco pruebas unitarias correctas.
- Sintaxis de cinco módulos JavaScript correcta.
- Auditoría npm final sin vulnerabilidades.
- Navegador real en 1440 × 1000 y 390 × 844.
- Cuatro ciclos de estación, variable y período sin recargar.
- Aviso de descarga abierto correctamente.
- Sin desbordamiento horizontal en escritorio ni móvil.
- Lectura reciente activa con una consulta por estación cada diez minutos.
- Primera ejecución de Pages correcta.
- Dos ejecuciones reales del publicador, incluida la línea exacta de cron.

Tamaño publicado: 1,5 MiB. Mayor CSV revisado: 348.915 bytes.

## Hashes del artefacto

```text
index.html
d71ff3c0f0f6802cc075c2d2fbec701da82dff145cb242fdb417e89b9e097972

data/manifest.json
d904c57e7969ef53b587532972bda3d34c305c7856fba7fef71f1c13e9d107d3

data/latest.csv
91270c36ba278a6ae2261326d959c86886aa063db6cb3779a4a54e72384bf799

scripts/export_monthly_csv.py
84eb3b4512bb04c735b637293e1499c5ec259399f74afa201eafa447cfb14ed7

scripts/update_data.sh
9ee7e0dd87d2690c912ef280e0d44159c58828301b67f7e779fb46cb8a2e6bcd

scripts/validate_export.py
e724b75d7cef065d6ae773f2c3186e3f8a9d3d3dc218a0a5b27e162e7027ad4f
```

Los hashes de `manifest.json` y `latest.csv` cambian cuando llegan mediciones.

## Reversión

1. Restaurar el crontab anterior desde el respaldo protegido con `crontab
   /home/cmas/backups/auca-cochrane-cron-before-2026-08-24/crontab.cmas`.
2. Adquirir `/tmp/auca-cochrane-update.lock`.
3. Conservar el repositorio y el log para diagnóstico.
4. Revertir el último cambio publicado mediante `git revert` si corresponde.
5. Verificar GitHub Pages y documentar el resultado.

La tarea de Aire Aconcagua no debe modificarse al instalar o retirar AUCA.
