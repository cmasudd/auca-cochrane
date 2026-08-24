# Operación del publicador AUCA Cochrane

Este archivo se completará con las referencias finales después de crear el
repositorio público, ejecutar el backfill e instalar la tarea horaria.

## Diseño

- Edición humana: `/home/cmas/Documentos/auca-cochrane`.
- Publicador: clon exclusivo bajo `/home/cmas/servicios/`.
- Python: entorno actualmente comprobado del API; migrable a un entorno propio.
- MariaDB: conexión local mediante archivo protegido, nunca versionado.
- Frecuencia propuesta: minuto 17 de cada hora.
- Lock propuesto: `/tmp/auca-cochrane-update.lock`.
- Log: local e ignorado por Git.

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

## Reversión propuesta

1. Retirar solamente la línea AUCA del crontab restaurando el respaldo previo.
2. Adquirir `/tmp/auca-cochrane-update.lock`.
3. Conservar el repositorio y el log para diagnóstico.
4. Revertir el último cambio publicado mediante `git revert` si corresponde.
5. Verificar GitHub Pages y documentar el resultado.

La tarea de Aire Aconcagua no debe modificarse al instalar o retirar AUCA.
