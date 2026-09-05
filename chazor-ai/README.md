# CHAZOR AI

Персональный AI-компаньон для BYD Chazor: поездки, батарея, расход, обслуживание,
диагностика и голосовой ассистент Claude — на iPhone и в Apple CarPlay.

Это **рабочий прототип с архитектурой под реальные данные**, а не статичный макет.
Цифры на экранах двигаются: встроенный симулятор ездового цикла разряжает батарею,
переключает EV → HEV, греет двигатель и копит поездку. Тот же интерфейс подключается к
реальному автомобилю заменой одного провайдера.

> **Штатная приборная панель BYD не заменяется.** Приложение — дополнительный интерфейс.
> Оно ничего не записывает в автомобиль: ни руль, ни тормоза, ни двигатель, ни двери,
> ни режимы движения. См. [`Docs/SAFETY.md`](Docs/SAFETY.md).

## Что внутри

| | |
|---|---|
| **Home** | скорость, заряд и режим, запас хода, поездка, расход, кнопка `ASK CLAUDE` |
| **Trips** | текущая поездка, периоды Today / Yesterday / 7 days / 30 days, графики Swift Charts, EV/HEV-разбивка, список поездок |
| **Car** | Vehicle, Battery, 12V, Temperature, Drive Mode, Errors, Mileage, Maintenance — каждый параметр со статусом `NORMAL` / `WARNING` / `CRITICAL`; диагностические коды; переключатель источника данных |
| **Maintenance** | ENGINE OIL, AIR FILTER, BRAKE CHECK, SERVICE с обратным отсчётом по километрам и дням; ручное добавление обслуживания (Service / Date / Mileage / Cost / Notes) в SwiftData |
| **AI** | голосовой вопрос, короткий ответ, озвучка, готовые вопросы, инспектор отправляемого контекста |
| **CarPlay** | вкладки Now / Car / Trips / Claude на официальных шаблонах, без спидометра — см. ниже |

## Запуск

```sh
open chazor-ai/ChazorAI.xcodeproj
```

Xcode 15+, iOS 17+. Сторонних зависимостей нет — Swift Charts и SwiftData входят в SDK.
Приложение запускается сразу: источник данных по умолчанию — `Demo`, история поездок и
обслуживания засевается при первом старте.

### Ключ Claude

Ассистент работает без ключа: `OfflineAIService` отвечает на те же вопросы локально по тем
же данным. Чтобы включить Claude:

- **в разработке** — Product → Scheme → Edit Scheme → Run → Arguments → Environment
  Variables, включить `ANTHROPIC_API_KEY` (переменная уже заведена в схеме, галочка снята);
- **на устройстве** — AI → шестерёнка → вставить ключ, он сохранится в Keychain.

Ключ не попадает в UI-код, в репозиторий и в бинарник: его читает только `ClaudeService`
через `APIKeyStore`.

### Тесты

```sh
xcodebuild test -scheme ChazorAI -destination 'platform=iOS Simulator,name=iPhone 15'
```

Покрыты пороги статусов, арифметика поездок, парсер OBD-II, декодер CAN, расчёт интервалов
ТО, разбор ответа Messages API, офлайн-ассистент и лимиты CarPlay.

## CarPlay

Ограничения проверены до написания кода — [`Docs/CARPLAY.md`](Docs/CARPLAY.md) со ссылками
на документацию Apple. Коротко:

- сторонние приложения **не рисуют** на экране CarPlay, только объявляют шаблоны;
- нужен entitlement, и его категория определяет набор шаблонов. Для автомобильного
  компаньона это **driving task** (`com.apple.developer.carplay-driving-task`);
- глубина стека шаблонов — 2 уровня, ввод текста при движении заблокирован;
- **спидометра в CarPlay нет намеренно**: штатная панель показывает скорость точнее и
  раньше, а два расходящихся числа хуже одного. CarPlay показывает то, чего на панели нет.

Файл entitlement лежит в `Config/ChazorAI.entitlements`, но специально **не подключён** к
build settings — иначе проект не собрался бы у тех, кому Apple ещё не выдала разрешение.
Как включить — в конце `Docs/CARPLAY.md`.

## Реальные данные: OBD-II и CAN

Единственный шов к автомобилю — протокол `VehicleDataProvider`:

```swift
protocol VehicleDataProvider: AnyObject {
    var sourceID: VehicleDataSourceID { get }
    var connectionState: ConnectionState { get }
    var frames: AsyncStream<VehicleFrame> { get }

    func connect()
    func disconnect()
    func getVehicleStatus() async throws -> VehicleStatusSnapshot
    func getBatteryStatus() async throws -> BatteryStatusSnapshot
    func getDiagnostics() async throws -> DiagnosticsSnapshot
    func getTripData() async throws -> TripSnapshot
}
```

Три реализации:

- **`MockVehicleDataProvider`** — симулятор ездового цикла, работает всегда;
- **`BluetoothOBDProvider`** — BLE-адаптер ELM327: поиск сервиса, инициализация,
  последовательная очередь команд с таймаутами, разбор стандартных PID (скорость, температура,
  обороты, напряжение, пробег, расход, коды ошибок);
- **`CANDataProvider`** — только приём кадров и декодирование по карте сигналов.

Чего здесь намеренно нет: **протокол BYD не выдуман**. Заряд тяговой батареи, режим EV/HEV
и заводской бортовой компьютер не входят в стандарт OBD-II, а CAN-матрица Chazor не
опубликована. Вместо правдоподобных догадок эти параметры возвращают
`VehicleDataError.requiresManufacturerDefinition`, а `CANDataProvider` без карты сигналов
отказывается сообщать что-либо. Подставить документированную карту — одна структура.

## Документация

- [`Docs/CARPLAY.md`](Docs/CARPLAY.md) — ограничения CarPlay, что реализовано и что осталось только на телефоне
- [`Docs/ARCHITECTURE.md`](Docs/ARCHITECTURE.md) — слои, швы, конкурентность, вызов Claude API
- [`Docs/SAFETY.md`](Docs/SAFETY.md) — почему приложение физически не может ничего записать в автомобиль

## Структура

```
chazor-ai/
├── ChazorAI/
│   ├── App/            композиционный корень, точка входа, таб-бар
│   ├── Domain/         снимки данных, пороги статусов, арифметика, форматтеры
│   ├── Persistence/    SwiftData-модели, засев, запросы по поездкам и ТО
│   ├── Vehicle/        VehicleDataProvider + Mock / OBD / CAN, телеметрия, запись поездок
│   ├── AI/             AIService, контекст, ClaudeService, офлайн-движок, голос
│   ├── DesignSystem/   тема и компоненты
│   ├── Features/       экраны Home / Trips / Car / Maintenance / AI
│   ├── CarPlay/        сцена, координатор шаблонов, лимиты
│   └── Resources/      Assets.xcassets
├── ChazorAITests/      юнит-тесты
├── Config/             Info.plist, entitlements
├── Docs/
├── Tools/              генератор .xcodeproj
└── preview/            веб-превью экранов (GitHub Pages)
```

## Веб-превью

Экраны можно посмотреть без Xcode — [`preview/index.html`](preview/index.html) повторяет тот
же дизайн и ту же логику симулятора на HTML/CSS/JS. Это витрина дизайна, а не приложение:
CarPlay, SwiftData, Bluetooth и Claude живут только в Swift-проекте.
