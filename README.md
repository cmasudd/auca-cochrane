# Plataforma AUCA Cochrane

Sitio estático para consultar y descargar datos ambientales de los dispositivos
AUCA 1 a AUCA 4. La web se publica con GitHub Pages y los datos se extraen del
MariaDB local una vez por hora.

## Dispositivos

| Nombre público | Código | ID local |
|---|---|---:|
| AUCA 1 | `HIRI-AUCA-1` | 241 |
| AUCA 2 | `HIRI-AUCA-2` | 242 |
| AUCA 3 | `HIRI-AUCA-3` | 243 |
| AUCA 4 | `HIRI-AUCA-4` | 244 |

Esta primera versión no publica fotografías ni geolocalización. Los nombres y
ubicaciones definitivos se incorporarán solamente después de validarlos.

## Datos publicados

- PM1, PM2.5 y PM10.
- Temperatura y humedad ambientales.
- Temperatura y humedad internas del equipo.
- Estado del relé del calefactor.
- Nivel de señal telefónica.

Latitud, longitud y velocidad se excluyen porque no son necesarias para esta
etapa. Satélites y voltaje también se excluyen porque el perfil inicial encontró
solo valores centinela o constantes. La evidencia y el criterio están en
[`docs/PERFIL_DATOS.md`](docs/PERFIL_DATOS.md).

## Arquitectura

```text
MariaDB local
  -> scripts/export_monthly_csv.py
  -> data/HIRI-AUCA-*/AAAA-MM-part-001.csv
  -> commit horario
  -> GitHub Pages
  -> navegador
```

Los históricos nunca se solicitan al API desde el navegador. La vista reciente
puede hacer una solicitud `limite=1` por estación cada diez minutos; si falla,
conserva `data/latest.csv` como respaldo.

## Estructura modular

```text
index.html                    estructura accesible
assets/css/base.css           variables y reglas globales
assets/css/components.css     componentes visuales
assets/css/responsive.css     escritorio, tablet y móvil
assets/js/config.js           configuración y variables
assets/js/data-service.js     CSV, manifiesto y lectura reciente
assets/js/charts.js           Chart.js y estadísticas
assets/js/downloads.js        descarga seleccionada
assets/js/app.js              estado e interacciones
config/stations.json          inventario de dispositivos
scripts/                      exportación, validación y publicación
```

Chart.js se sirve localmente desde `assets/vendor/`, por lo que una falla de un
CDN no impide iniciar el gráfico.

## Exportación

El script lee las variables protegidas de MariaDB desde una ruta local y no las
imprime ni las copia al repositorio.

Mes vigente:

```bash
/var/www/api_sensores/venv/bin/python scripts/export_monthly_csv.py
```

Histórico inicial:

```bash
/var/www/api_sensores/venv/bin/python scripts/export_monthly_csv.py --all
```

Estación y mes específicos:

```bash
/var/www/api_sensores/venv/bin/python scripts/export_monthly_csv.py \
  --station HIRI-AUCA-1 \
  --month 2026-08
```

Cada CSV contiene una estación y un mes. Si llega a 40 MiB, continúa en otra
parte. La escritura usa un temporal, `fsync` y reemplazo atómico.

## Validación

```bash
/var/www/api_sensores/venv/bin/python -m unittest discover -s tests -v
/var/www/api_sensores/venv/bin/python scripts/validate_export.py
node --check assets/js/app.js
```

El validador comprueba contrato, estaciones, encabezados, meses, orden,
tamaños, rutas y lectura reciente.

## Vista local

Los módulos JavaScript y los CSV requieren un servidor HTTP:

```bash
python3 -m http.server 8766 --bind 127.0.0.1
```

Abrir `http://127.0.0.1:8766/`.

## Automatización

El servidor usa un clon exclusivo para la tarea horaria. El wrapper:

1. rechaza cambios manuales pendientes;
2. sincroniza con `git pull --ff-only`;
3. exporta el mes vigente;
4. valida antes de publicar;
5. crea un commit solo si cambió `data/`;
6. intenta el `push`, incluso si quedó pendiente de una hora anterior.

La instalación exacta, verificación y reversión se registran en
[`docs/OPERACION_SERVIDOR.md`](docs/OPERACION_SERVIDOR.md).
