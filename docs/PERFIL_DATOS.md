# Perfil y selección de datos

Fecha de revisión: 2026-08-24

Fuente: MariaDB local

Dispositivos: 241, 242, 243 y 244

## Regla previa a publicar

Que una variable exista no significa que deba publicarse. Antes de decidir se
revisa:

1. utilidad para el objetivo de la web;
2. unidad y significado inequívocos;
3. cobertura en todos los dispositivos;
4. rango, constantes y centinelas;
5. duplicidad con otros sensores;
6. posibilidad de revelar ubicación o información sensible;
7. costo de almacenamiento y visualización;
8. responsable que puede explicar su interpretación.

## Cobertura encontrada

Los cuatro equipos tienen mediciones desde el 29 o 30 de julio de 2026. En la
revisión inicial cada estación tenía aproximadamente siete mil ciclos de
medición y seguía enviando datos el 24 de agosto.

## Variables publicadas

| Origen | Variable | Decisión |
|---|---|---|
| PMS5003 | PM1, PM2.5 y PM10 | publicar; son el objetivo ambiental principal |
| PMS5003 | temperatura y humedad | publicar; datos presentes en los cuatro equipos |
| CALEFACTORCMAS | temperatura y humedad internas | publicar como diagnóstico, claramente diferenciadas |
| CALEFACTORCMAS | relé | publicar como estado operativo |
| SIM7600G | intensidad de señal | publicar como diagnóstico de conectividad |

## Variables excluidas

| Variable | Evidencia inicial | Razón |
|---|---|---|
| latitud y longitud | existen en los cuatro equipos | no hay geolocalización autorizada para la web; pueden revelar ubicación |
| velocidad | existe en el módem | no aporta al monitoreo ambiental estacionario inicial |
| satélites | todas las filas revisadas valen `-1` | dato centinela, sin información útil |
| voltaje | todas las filas revisadas valen `0` | constante no diagnóstica en el período |
| temperatura/humedad genéricas de CALEFACTORCMAS | duplican conceptos ambientales | se prefieren PMS5003 y las columnas internas explícitas |

## Valores ausentes

El firmware registra `-1` en grupos de campos cuando una lectura no está
disponible. Se observó en relé, temperatura/humedad internas y cuatro lecturas
simultáneas de temperatura/humedad PMS de AUCA 4. El exportador convierte ese
valor exacto en celda vacía.

Esta regla debe revisarse si cambian firmware o sensores, especialmente porque
una temperatura real de `-1 °C` es posible en la región. Una versión futura
debería distinguir el estado de lectura mediante un campo de calidad explícito.

## Revisión antes de agregar una variable

- Ejecutar conteo, mínimo, máximo, nulos, constantes y centinelas por estación.
- Revisar al menos una serie temporal y coincidencia entre campos relacionados.
- Confirmar unidad con el responsable del sensor.
- Definir nombre público, columna, unidad y decimales.
- Evaluar privacidad y necesidad de publicación.
- Agregar la variable al exportador, manifiesto, configuración web y pruebas.
- Ejecutar un backfill acotado y comparar con MariaDB.
- Registrar fecha, evidencia, responsable y rollback.
