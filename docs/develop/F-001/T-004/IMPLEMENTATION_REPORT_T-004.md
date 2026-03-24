# Implementation Report -- T-004 Build Pipeline Configuration

## Implemented Scope

- Конфигурация tsup для packages/types: entry point, dual format (ESM + CJS), declaration files, sourcemaps, clean build
- Корневые build-скрипты: `build` (все workspaces) и `build:types` (только packages/types)
- Добавлен tsup в devDependencies корневого package.json
- Создан tsconfig.types.json для корректной генерации DTS в изоляции от корневого composite tsconfig

## Tests Implemented

- Ручная верификация: `npm run build` собирает packages/types через tsup
- Ручная верификация: `npm run build:types` собирает только packages/types
- Проверка артефактов в dist/:
  - `index.js` (ESM) + `index.js.map` (sourcemap)
  - `index.cjs` (CJS) + `index.cjs.map` (sourcemap)
  - `index.d.ts` (declaration ESM) + `index.d.cts` (declaration CJS)

## Code Changes

### Files Added

- `/home/aristman/projects/osai/packages/types/tsup.config.ts` -- конфигурация tsup
- `/home/aristman/projects/osai/packages/types/tsconfig.types.json` -- изолированный tsconfig для DTS генерации

### Files Modified

- `/home/aristman/projects/osai/package.json` -- добавлен скрипт `build:types`, добавлен `tsup` в devDependencies
- `/home/aristman/projects/osai/packages/types/package.json` -- скрипт `build` изменён с `tsc` на `tsup`, добавлены `main` (CJS), `module` (ESM), `require` в exports

## Architectural Compliance

- Соблюдается монорепо-структура с workspaces
- packages/types экспортирует dual-format (ESM + CJS)
- declaration files генерируются для обоих форматов
- tsconfig.types.json изолирован от корневого composite tsconfig для корректной работы tsup DTS builder

## Deviations

1. **tsconfig.types.json** -- дополнительный файл, не указанный в исходном задании. Необходим для корректной генерации DTS через tsup. Корневой tsconfig.json содержит `composite: true` без `include`, что приводит к ошибке `TS6307: File is not listed within the file list of project` при использовании tsc из tsup. Дочерний tsconfig, наследующий корневой, также затрагивается этой проблемой. tsconfig.types.json не наследует корневой и содержит собственный `include: ["src/**/*"]`.

2. **index.d.cts** -- tsup автоматически генерирует отдельный declaration file для CJS формата (`.d.cts`). Это стандартное поведение tsup и не является отклонением.

## Known Limitations

- tsconfig.json packages/types (наследующий корневой composite) используется IDE и tsc --build для проектных ссылок, но не используется tsup для сборки
- При добавлении новых файлов в src/ packages/types необходимо убедиться, что они покрываются `include: ["src/**/*"]` в tsconfig.types.json (текущий паттерн покрывает все вложенные файлы)
