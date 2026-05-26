# Q-Karnes POS antiX (Web Local + runit + kiosko)

## Requisitos previos
- antiX con runit
- Node.js LTS y npm instalados
- usuario con `sudo`

## Empaquetado desde entorno de desarrollo
```bash
sh scripts/package-antix-qkarnes.sh
```

Resultado:
```text
dist/qkarnes-pos-antix.tar.gz
```

## Empaquetado `.deb` (instalador recomendado)
```bash
sh scripts/package-antix-deb.sh 1.0.0 all
```

Resultado:
```text
dist/install-qkarnes-pos_1.0.0_all.deb
dist/install-qkarnes-pos
```

Instalación en antiX:
```bash
cd dist
sh ./install-qkarnes-pos
```

## Instalación en antiX
```bash
tar -xzf qkarnes-pos-antix.tar.gz
cd qkarnes-pos-antix
sudo sh scripts/install-antix-qkarnes.sh "$(pwd)" --force-clean-db
```

## Estructura instalada
```text
/opt/qkarnes-pos/
  app/
  data/qkarnes.sqlite
  backups/
  logs/
  config/qkarnes.env
```

## Usuarios productivos iniciales
```text
admin  / admin001
cajero / cajero001
```

## Operación
```bash
sudo sv status qkarnes-pos
curl http://127.0.0.1:3000/api/health
curl http://127.0.0.1:3000/api/auth/bootstrap-status
qkarnes-kiosk
```

## Autostart kiosko (opcional)
```bash
sudo sh scripts/setup-kiosk-autostart.sh pos
```
