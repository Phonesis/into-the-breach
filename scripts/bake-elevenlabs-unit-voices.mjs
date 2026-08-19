/**
 * Unit-class radio / field voices via ElevenLabs.
 * Adds class-specific select, move, attack, and retreat lines on top of the
 * existing generic infantry packs. Infantry only gains a move pack (select /
 * attack / retreat already exist). Vehicles stay on the crew-intercom pack.
 *
 * Writes:
 *   public/sounds/unit-{kind}-{class}-{faction}-NN.wav
 *
 *   ELEVENLABS_API_KEY=sk_… node scripts/bake-elevenlabs-unit-voices.mjs
 *   ELEVENLABS_API_KEY=sk_… node scripts/bake-elevenlabs-unit-voices.mjs --force
 *   node scripts/bake-elevenlabs-unit-voices.mjs --validate
 *   ELEVENLABS_API_KEY=sk_… node scripts/bake-elevenlabs-unit-voices.mjs --only=sniper,medic
 *   ELEVENLABS_API_KEY=sk_… node scripts/bake-elevenlabs-unit-voices.mjs --kind=move
 */
import { spawnSync } from 'child_process';
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = dirname(fileURLToPath(import.meta.url));
const outDir = join(root, '../public/sounds');
const tempDir = join(root, '../.tmp-elevenlabs-unit-voices');
const api = 'https://api.elevenlabs.io/v1/text-to-speech';
const force = process.argv.includes('--force');
const validateOnly = process.argv.includes('--validate');
const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
const promptLimit = 450;
const onlyArg = process.argv.find((arg) => arg.startsWith('--only='))?.slice(7) ?? null;
const kindArg = process.argv.find((arg) => arg.startsWith('--kind='))?.slice(7) ?? null;
const onlyClasses = onlyArg
  ?.split(',')
  .map((value) => value.trim())
  .filter(Boolean) ?? null;
const onlyKinds = kindArg
  ?.split(',')
  .map((value) => value.trim())
  .filter(Boolean) ?? null;

const voices = {
  usa: [
    { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam' },
    { id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold' },
  ],
  uk: [
    { id: 'JBFqnCBsd6RMkjVDRZzb', name: 'George' },
    { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel' },
  ],
  germany: [
    { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam' },
    { id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold' },
  ],
  russia: [
    { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam' },
    { id: 'N2lVS1w4EtoT3dr4eOWO', name: 'Callum' },
  ],
  japan: [
    { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam' },
    { id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold' },
  ],
};

/** Short radio acks. Infantry only needs move; other classes get a full set. */
const lines = {
  usa: {
    infantry: {
      move: ['Moving out!', 'Squad, advance!', 'On the way.', "Let's go, let's go!"],
    },
    machineGun: {
      select: ['Gun up. Ready to fire.', "Thirty-cal's set, sir.", 'MG team standing by.'],
      move: ['Packing the gun. Moving.', 'MG team, displace.', 'Breaking down the tripod.'],
      attack: ['Machine gun, fire!', 'Open up! Sweep the line!', 'Gunner, traverse and fire!'],
      retreat: ['Displace the gun! Now!', 'Get the thirty-cal back!', 'Pull the MG out!'],
    },
    mortar: {
      select: ["Tube's laid. Ready.", 'Mortar section standing by.', 'Awaiting fire mission.'],
      move: ['Shoulder the tube. Moving.', 'Mortar team, displace.', "Pack it up, we're relocating."],
      attack: ['Fire mission received. Dropping rounds.', 'Hang it! Fire!', 'Mortar, on the way!'],
      retreat: ['Pack the tube! Fall back!', 'Displace the mortar!', 'Get the section out!'],
    },
    sniper: {
      select: ['Spotter and rifle ready.', 'Overwatch in position.', 'Marksman standing by.'],
      move: ['Relocating. Keep low.', 'Moving to a new hide.', 'Sniper team, shifting.'],
      attack: ['Target in the glass. Taking the shot.', 'One round. Sending.', 'Firing.'],
      retreat: ["We're made! Fall back!", 'Breaking hide! Move!', 'Get off this position!'],
    },
    antiTankGun: {
      select: ['Anti-tank gun ready.', 'Crew at the piece.', 'Gun laid, awaiting armor.'],
      move: ['Limbering the gun.', 'AT crew, relocating.', "Trails up. We're moving."],
      attack: ['Armor! Fire!', 'A.P. loaded. On the way!', 'Traverse — fire at that tank!'],
      retreat: ['Hook up and pull back!', 'Get the gun out of here!', 'Abandon if you have to — move!'],
    },
    artillery: {
      select: ['Howitzer section ready.', 'Battery on the net.', 'Gun crew standing by.'],
      move: ['Limber up. Relocate the gun.', 'Artillery, displacing.', "Trails up, we're moving."],
      attack: ['Fire mission. Shot, over.', 'On the way!', 'Battery, fire!'],
      retreat: ['Limber and withdraw!', 'Get the gun back!', 'Displace the battery!'],
    },
    medic: {
      select: ['Medic here. Ready.', "Aid kit's packed.", 'Standing by for casualties.'],
      move: ['Moving to the wounded.', 'Medic, on the way.', 'Relocating the aid post.'],
      attack: ['Covering fire. Stay with the wounded.', "I'll hold them off.", 'Engaging to protect the casualties.'],
      retreat: ['Casualties with us! Fall back!', 'Get the wounded out!', 'Aid station, withdrawing!'],
    },
    engineer: {
      select: ['Engineers ready.', "Demo kit's packed.", 'Sappers standing by.'],
      move: ['Engineers moving.', 'Taking the tools forward.', 'On the move, over.'],
      attack: ['Clearing the way. Engaging.', 'Sappers, return fire!', "We'll take that position."],
      retreat: ['Drop the charge, fall back!', 'Engineers, withdraw!', 'Get off this ground!'],
    },
    commander: {
      select: ['Command group here.', 'Headquarters on the net.', 'Commander standing by.'],
      move: ["Command element's moving.", 'HQ relocating.', 'Follow me.'],
      attack: ["We're going in. Engage!", 'Command group, fire!', 'Push them back!'],
      retreat: ['Headquarters, fall back!', 'Command group, withdraw!', 'Back to the rally!'],
    },
    radioOperator: {
      select: ["Radio's up. Net is open.", 'Signals standing by.', 'Operator ready, over.'],
      move: ['Packing the set. Moving.', 'Radio, relocating.', 'Keeping the net up on the move.'],
      attack: ["Call confirmed. We're engaging.", 'Operator, covering fire!', 'Firing — still on the net.'],
      retreat: ["Set's coming with us! Fall back!", 'Signals, withdraw!', 'Keep the net, get out!'],
    },
  },
  uk: {
    infantry: {
      move: ['Moving off!', 'Section, advance!', 'On our way, sir.', 'Come on, lads — move!'],
    },
    machineGun: {
      select: ['Gun ready to fire.', "Vickers is set, sir.", 'Machine-gun team standing by.'],
      move: ['Packing the gun. Moving.', 'Gun team, displace.', 'Tripod up — relocating.'],
      attack: ['Machine gun, fire!', 'Open fire! Sweep the front!', 'Gunner, traverse and fire!'],
      retreat: ['Displace the gun! Quickly!', 'Get the Vickers back!', 'Pull the gun out!'],
    },
    mortar: {
      select: ['Tube laid on. Ready.', 'Mortar section standing by.', 'Awaiting a fire mission.'],
      move: ['Shoulder the barrel. Moving.', 'Mortars, displace.', 'Pack it up — we are relocating.'],
      attack: ['Fire mission received. Rounds away.', 'Hang it — fire!', 'Mortar, on the way!'],
      retreat: ['Pack the tube! Fall back!', 'Displace the mortar!', 'Get the section out!'],
    },
    sniper: {
      select: ['Spotter and rifle ready.', 'Overwatch in position.', 'Marksman standing by.'],
      move: ['Relocating. Keep low.', 'Moving to a new hide.', 'Sniper pair, shifting.'],
      attack: ['Target in the glass. Taking the shot.', 'One round. Sending.', 'Firing now.'],
      retreat: ["We've been spotted! Fall back!", 'Break the hide — move!', 'Off this position!'],
    },
    antiTankGun: {
      select: ['Anti-tank gun ready.', 'Crew at the piece.', 'Gun laid, awaiting armour.'],
      move: ['Limbering the gun.', 'A.T. crew, relocating.', 'Trails up. Moving.'],
      attack: ['Armour! Fire!', 'A.P. loaded. On the way!', 'Traverse — fire at that tank!'],
      retreat: ['Hook in and pull back!', 'Get the gun out of here!', 'Leave it if you must — move!'],
    },
    artillery: {
      select: ['Twenty-five pounder ready.', 'Battery on the net.', 'Gun crew standing by.'],
      move: ['Limber up. Relocate the gun.', 'Artillery, displacing.', 'Trails up, we are moving.'],
      attack: ['Fire mission. Shot, over.', 'On the way!', 'Battery, fire!'],
      retreat: ['Limber and withdraw!', 'Get the gun back!', 'Displace the battery!'],
    },
    medic: {
      select: ['Medic here. Ready.', 'Aid kit packed.', 'Standing by for casualties.'],
      move: ['Moving to the wounded.', 'Medic, on the way.', 'Relocating the aid post.'],
      attack: ['Covering fire. Stay with the wounded.', "I'll hold them, sir.", 'Engaging to protect the casualties.'],
      retreat: ['Casualties with us! Fall back!', 'Get the wounded out!', 'Aid post, withdrawing!'],
    },
    engineer: {
      select: ['Sappers ready.', 'Demo kit packed.', 'Engineers standing by.'],
      move: ['Sappers moving.', 'Taking the tools forward.', 'On the move, over.'],
      attack: ['Clearing the way. Engaging.', 'Sappers, return fire!', "We'll take that position."],
      retreat: ['Drop the charge, fall back!', 'Sappers, withdraw!', 'Off this ground!'],
    },
    commander: {
      select: ['Command group here.', 'Headquarters on the net.', 'Commander standing by.'],
      move: ['Command element moving.', 'HQ relocating.', 'Follow me.'],
      attack: ["We're going in. Engage!", 'Command group, fire!', 'Push them back!'],
      retreat: ['Headquarters, fall back!', 'Command group, withdraw!', 'Back to the rally!'],
    },
    radioOperator: {
      select: ['Wireless is up. Net is open.', 'Signals standing by.', 'Operator ready, over.'],
      move: ['Packing the set. Moving.', 'Wireless, relocating.', 'Keeping the net up on the move.'],
      attack: ["Call confirmed. We're engaging.", 'Operator, covering fire!', 'Firing — still on the net.'],
      retreat: ['Set comes with us! Fall back!', 'Signals, withdraw!', 'Keep the net, get out!'],
    },
  },
  germany: {
    infantry: {
      move: ['Wir rücken vor!', 'Gruppe, vorwärts!', 'Marsch, marsch!', 'In Stellung gehen!'],
    },
    machineGun: {
      select: ['MG-Trupp bereit.', 'Lafette steht. Melde mich.', 'Maschinengewehr klar.'],
      move: ['MG abbauen, wir verlegen!', 'Trupp, Stellung wechseln!', 'Lafette einpacken, vorwärts!'],
      attack: ['MG, Feuer frei!', 'Gurt durchladen, feuern!', 'MG, den Abschnitt bestreichen!'],
      retreat: ['MG in Sicherheit bringen!', 'Lafette abbauen, zurück!', 'MG-Trupp, absetzen!'],
    },
    mortar: {
      select: ['Werfer bereit.', 'Rohr liegt. Warten auf Feuerbefehl.', 'Granatwerfertrupp steht.'],
      move: ['Rohr schultern, verlegen!', 'Werferstaffel, Stellung wechseln!', 'Packen, wir setzen um!'],
      attack: ['Feuerauftrag verstanden. Werfen!', 'Granate — feuern!', 'Werfer, Schuss!'],
      retreat: ['Rohr einpacken, zurück!', 'Werfer verlegen, schnell!', 'Staffel, absetzen!'],
    },
    sniper: {
      select: ['Scharfschütze bereit.', 'Beobachter und Schütze auf Position.', 'Überwachung steht.'],
      move: ['Stellung wechseln. Deckung halten.', 'Neues Versteck anlaufen.', 'Scharfschützen, verlegen.'],
      attack: ['Ziel im Glas. Schuss.', 'Ein Schuss, ich sende.', 'Ziel erfasst, feuern.'],
      retreat: ['Versteck aufgeflogen, raus!', 'Stellung aufgeben!', 'Zurück, schnell!'],
    },
    antiTankGun: {
      select: ['Pak bereit.', 'Geschütz bedient.', 'Rohr liegt, warten auf Panzer.'],
      move: ['Pak in Marsch setzen.', 'Geschütz verlegen.', 'Protz auf, wir fahren.'],
      attack: ['Panzer! Feuer!', 'Panzergranate, feuern!', 'Richten — Feuer!'],
      retreat: ['Pak zurück, sofort!', 'Geschütz abprotzen und raus!', 'Zur Not stehen lassen — absetzen!'],
    },
    artillery: {
      select: ['Haubitze bereit.', 'Batterie auf Empfang.', 'Geschützbedienung steht.'],
      move: ['Protz auf, Stellung wechseln.', 'Artillerie verlegt.', 'Rohr in Marschlage.'],
      attack: ['Feuerauftrag. Schuss!', 'Geschütz, Feuer!', 'Batterie, Feuer!'],
      retreat: ['Protz auf, zurück!', 'Geschütz in Sicherheit!', 'Batterie verlegen, schnell!'],
    },
    medic: {
      select: ['Sanitäter hier, bereit.', 'Verbandskasten gepackt.', 'Sanitätertrupp steht.'],
      move: ['Ich gehe zu den Verwundeten.', 'Sanitäter unterwegs.', 'Hilfsplatz verlegen.'],
      attack: ['Deckungsfeuer, Verwundete sichern!', 'Ich halte sie auf!', 'Feuerstoß, dann weiterhelfen!'],
      retreat: ['Verwundete mitnehmen, zurück!', 'Sanitäter, absetzen!', 'Hilfsplatz verlegen, schnell!'],
    },
    engineer: {
      select: ['Pioniere bereit.', 'Sprengmittel gepackt.', 'Pioniertrupp steht.'],
      move: ['Pioniere rücken vor.', 'Gerät mitnehmen, vorwärts.', 'Wir sind unterwegs.'],
      attack: ['Bahn frei, feuern!', 'Pioniere, Feuer erwidern!', 'Wir nehmen die Stellung.'],
      retreat: ['Ladung liegen lassen, zurück!', 'Pioniere, absetzen!', 'Raus aus dem Abschnitt!'],
    },
    commander: {
      select: ['Kommandogruppe hier.', 'Gefechtsstand auf Empfang.', 'Kommandeur bereit.'],
      move: ['Befehlsstelle verlegt.', 'Kommandogruppe setzt sich in Bewegung.', 'Mir nach.'],
      attack: ['Wir greifen mit an. Feuer!', 'Kommandogruppe, feuern!', 'Drücken Sie sie zurück!'],
      retreat: ['Stab, zurück!', 'Kommandogruppe setzt sich ab!', 'Zurück zum Sammelpunkt!'],
    },
    radioOperator: {
      select: ['Funker bereit. Verbindung steht.', 'Gerät eingeschaltet.', 'Funktrupp auf Empfang.'],
      move: ['Gerät packen, wir verlegen.', 'Funker unterwegs, Verbindung bleibt.', 'Funkstelle verlegen.'],
      attack: ['Auftrag bestätigt, wir feuern.', 'Funker, Deckungsfeuer!', 'Senden und schießen.'],
      retreat: ['Gerät mitnehmen, zurück!', 'Funktrupp, absetzen!', 'Verbindung halten, raus hier!'],
    },
  },
  russia: {
    infantry: {
      move: ['Выдвигаемся!', 'Отделение, вперёд!', 'Пошли, пошли!', 'На исходную!'],
    },
    machineGun: {
      select: ['Пулемёт готов.', 'Расчёт на месте.', 'Пулемёт к бою.'],
      move: ['Сворачиваем пулемёт, меняем позицию.', 'Расчёт, перенос!', 'Станок на плечи, вперёд!'],
      attack: ['Пулемёт, огонь!', 'Коси линию!', 'Наводчик, огонь!'],
      retreat: ['Пулемёт уносим!', 'Сворачивай, отходим!', 'Расчёт, отход!'],
    },
    mortar: {
      select: ['Миномёт готов.', 'Ствол наведён. Жду команды.', 'Миномётный расчёт на месте.'],
      move: ['Ствол на плечо, меняем позицию.', 'Миномётчики, перенос!', 'Сворачиваемся, уходим на новую точку.'],
      attack: ['Огневая задача принята. Огонь!', 'Мину — огонь!', 'Миномёт, выстрел!'],
      retreat: ['Сворачивай ствол, назад!', 'Миномёт уносим!', 'Расчёт, отход!'],
    },
    sniper: {
      select: ['Снайпер готов.', 'Наблюдатель и стрелок на позиции.', 'Наблюдение держим.'],
      move: ['Меняем позицию. Ниже голову.', 'Идём на новую засаду.', 'Снайперы, перенос.'],
      attack: ['Цель в прицеле. Выстрел.', 'Один патрон. Посылаю.', 'Цель вижу, огонь.'],
      retreat: ['Нас обнаружили! Отходим!', 'Позицию бросаем!', 'Быстро назад!'],
    },
    antiTankGun: {
      select: ['Противотанковое орудие готово.', 'Расчёт у орудия.', 'Орудие наведено, ждём танки.'],
      move: ['Орудие в походное.', 'Расчёт, меняем позицию.', 'Передки, двигаемся.'],
      attack: ['Танк! Огонь!', 'Бронебойным, огонь!', 'Наводить — огонь!'],
      retreat: ['Орудие назад, быстро!', 'Сцеплять и уходить!', 'Бросай, если надо — отходим!'],
    },
    artillery: {
      select: ['Гаубица готова.', 'Батарея на связи.', 'Орудийный расчёт на месте.'],
      move: ['Передки, меняем позицию.', 'Артиллерия переезжает.', 'Орудие в походное.'],
      attack: ['Огневая задача. Выстрел!', 'Орудие, огонь!', 'Батарея, огонь!'],
      retreat: ['Передки, назад!', 'Орудие в укрытие!', 'Батарею снимаем, быстро!'],
    },
    medic: {
      select: ['Санитар на месте. Готов.', 'Сумка собрана.', 'Санитарный расчёт ждёт.'],
      move: ['Иду к раненым.', 'Санитар выдвигается.', 'Переносим пункт помощи.'],
      attack: ['Прикройте, я с ранеными!', 'Держу их огнём!', 'Огонь, потом к раненым!'],
      retreat: ['Раненых с собой, отходим!', 'Санитары, отход!', 'Пункт помощи снимаем!'],
    },
    engineer: {
      select: ['Сапёры готовы.', 'Взрывчатка собрана.', 'Инженерный расчёт на месте.'],
      move: ['Сапёры выдвигаются.', 'Инструмент с собой, вперёд.', 'Мы в движении.'],
      attack: ['Расчищаем путь. Огонь!', 'Сапёры, ответить огнём!', 'Берём позицию.'],
      retreat: ['Заряд бросай, отходим!', 'Сапёры, отход!', 'Уходим с участка!'],
    },
    commander: {
      select: ['Командная группа на связи.', 'Штаб слушает.', 'Командир готов.'],
      move: ['КП переносим.', 'Командная группа выдвигается.', 'За мной.'],
      attack: ['Идём в атаку. Огонь!', 'Командная группа, огонь!', 'Тесните их!'],
      retreat: ['Штаб, отход!', 'Командная группа отходит!', 'На пункт сбора!'],
    },
    radioOperator: {
      select: ['Радист готов. Связь есть.', 'Станция включена.', 'Радиогруппа на приёме.'],
      move: ['Станцию пакуем, меняем место.', 'Радист в движении, связь держим.', 'Переносим радиоточку.'],
      attack: ['Приказ принят, открываем огонь.', 'Радист, прикрой огнём!', 'Стреляем, связь держим.'],
      retreat: ['Станцию с собой, отходим!', 'Радиогруппа, отход!', 'Связь не терять, уходим!'],
    },
  },
  japan: {
    infantry: {
      move: ['前進する！', '分隊、進め！', '移動開始！', '配置へ急げ！'],
    },
    machineGun: {
      select: ['機関銃、準備完了。', '銃架よし。待機しております。', '機関銃班、配置につきました。'],
      move: ['機関銃を撤収、移動する。', '班、陣地転換！', '銃架を担げ、前進！'],
      attack: ['機関銃、撃て！', '射界を掃射せよ！', '銃手、旋回して撃て！'],
      retreat: ['機関銃を下げろ！', '銃架を撤収、後退！', '機関銃班、離脱せよ！'],
    },
    mortar: {
      select: ['迫撃砲、準備完了。', '砲身指向よし。射撃下令を待つ。', '迫撃砲班、配置につきました。'],
      move: ['砲を担げ、移動する。', '迫撃砲班、陣地転換！', '撤収して前進せよ。'],
      attack: ['射撃任務了解。撃て！', '砲弾、発射！', '迫撃砲、射撃開始！'],
      retreat: ['砲を撤収、後退！', '迫撃砲を下げろ！', '班、離脱せよ！'],
    },
    sniper: {
      select: ['狙撃手、準備完了。', '観測手、射手、配置よし。', '監視につき、待機しております。'],
      move: ['低姿勢で陣地転換。', '新たな潜伏位置へ。', '狙撃班、移動する。'],
      attack: ['照準内、撃つ。', '一発、発射する。', '目標確認、撃て。'],
      retreat: ['発見された！後退！', '潜伏を捨てて走れ！', 'この位置を離れろ！'],
    },
    antiTankGun: {
      select: ['速射砲、準備完了。', '砲員、砲側につきました。', '砲指向よし。戦車を待つ。'],
      move: ['砲を行進姿勢に。', '速射砲班、陣地転換。', '牽引して移動する。'],
      attack: ['戦車だ！撃て！', '徹甲弾、発射！', '照準、撃て！'],
      retreat: ['砲を下げろ、直ちに！', '牽引して離脱せよ！', 'やむを得ねば砲を捨てて退け！'],
    },
    artillery: {
      select: ['榴弾砲、準備完了。', '砲兵、通信よし。', '砲班、配置につきました。'],
      move: ['行進姿勢、陣地転換。', '砲兵、移動する。', '砲を牽引して前進。'],
      attack: ['射撃任務。発射！', '砲、撃て！', '砲兵、射撃開始！'],
      retreat: ['牽引して後退！', '砲を守れ、下がれ！', '砲兵、陣地を放棄せよ！'],
    },
    medic: {
      select: ['衛生兵、待機しております。', '救急嚢、準備よし。', '衛生班、配置につきました。'],
      move: ['負傷者のもとへ向かう。', '衛生兵、移動する。', '救護所を移す。'],
      attack: ['援護射撃、負傷者を守れ！', 'ここは私が抑える！', '応射しつつ救護する！'],
      retreat: ['負傷者を連れて後退！', '衛生班、離脱せよ！', '救護所を撤収！'],
    },
    engineer: {
      select: ['工兵、準備完了。', '爆破資材、準備よし。', '工兵班、待機しております。'],
      move: ['工兵、前進する。', '器材を持って進め。', '移動中。'],
      attack: ['進路を開け、撃て！', '工兵、応射せよ！', 'その位置を奪取する！'],
      retreat: ['爆薬を捨てて後退！', '工兵、離脱せよ！', 'この地を離れろ！'],
    },
    commander: {
      select: ['指揮班、こちらです。', '本部、通信よし。', '指揮官、待機しております。'],
      move: ['指揮所を移す。', '指揮班、移動する。', '私に続け。'],
      attack: ['指揮班も突入する。撃て！', '指揮班、射撃開始！', '押し返せ！'],
      retreat: ['本部、後退せよ！', '指揮班、離脱する！', '集合地点へ戻れ！'],
    },
    radioOperator: {
      select: ['通信手、準備完了。回線よし。', '無線機、作動中。', '通信班、受信待機。'],
      move: ['無線機を担ぎ、移動する。', '通信手、移動中。回線維持。', '通信所を移す。'],
      attack: ['命令了解、交戦する。', '通信手、援護射撃！', '射撃しつつ通信を保て。'],
      retreat: ['無線機を持って後退！', '通信班、離脱せよ！', '回線を維持し、退け！'],
    },
  },
};

const jobs = Object.entries(lines).flatMap(([faction, byClass]) =>
  Object.entries(byClass).flatMap(([unitClass, byKind]) =>
    Object.entries(byKind).flatMap(([kind, texts]) =>
      texts.map((text, index) => ({
        faction,
        unitClass,
        kind,
        text,
        voice: voices[faction][index % voices[faction].length],
        file: `unit-${kind}-${unitClass}-${faction}-${String(index + 1).padStart(2, '0')}.wav`,
      }))
    )
  )
);

const filteredJobs = jobs.filter((job) => {
  if (onlyClasses && !onlyClasses.includes(job.unitClass)) return false;
  if (onlyKinds && !onlyKinds.includes(job.kind)) return false;
  return true;
});

function validateJobs() {
  let invalid = false;
  const counts = {};
  for (const job of filteredJobs) {
    const length = [...job.text].length;
    const valid = length > 0 && length <= promptLimit;
    if (!valid) {
      console.log(`INVALID ${job.file}: text ${length}/${promptLimit}`);
      invalid = true;
    }
    const key = `${job.unitClass}/${job.kind}/${job.faction}`;
    counts[key] = (counts[key] ?? 0) + 1;
  }
  if (invalid) process.exit(1);
  console.log(`ok ${filteredJobs.length} lines`);
  for (const [key, count] of Object.entries(counts).sort()) {
    console.log(`  ${key}: ${count}`);
  }
}

async function generate(job) {
  const urgent = job.kind === 'retreat' || job.kind === 'attack';
  const response = await fetch(`${api}/${job.voice.id}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'xi-api-key': apiKey,
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text: job.text,
      model_id: 'eleven_multilingual_v2',
      voice_settings: {
        stability: urgent ? 0.34 : 0.48,
        similarity_boost: 0.74,
        style: urgent ? 0.5 : 0.38,
        use_speaker_boost: true,
      },
    }),
  });
  if (!response.ok) {
    throw new Error(`ElevenLabs ${response.status}: ${await response.text()}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

function convert(source, destination) {
  const filter = [
    'highpass=f=180',
    'lowpass=f=5200',
    'acompressor=threshold=-17dB:ratio=4.5:attack=4:release=70',
    'equalizer=f=1100:t=q:w=1.0:g=1.8',
    'equalizer=f=2300:t=q:w=1.0:g=2.2',
    'loudnorm=I=-18:TP=-1.5:LRA=7',
    'alimiter=limit=0.95',
    'afade=t=in:st=0:d=0.008',
    'areverse,afade=t=in:st=0:d=0.05,areverse',
  ].join(',');
  const result = spawnSync(
    'ffmpeg',
    ['-y', '-i', source, '-ac', '1', '-ar', '44100', '-sample_fmt', 's16', '-af', filter, destination],
    { encoding: 'utf8' }
  );
  if (result.status !== 0) {
    console.error(result.stderr?.slice(-500));
    throw new Error(`ffmpeg failed for ${destination}`);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  validateJobs();
  if (validateOnly) return;
  if (!apiKey) {
    console.error('Missing ELEVENLABS_API_KEY');
    process.exit(1);
  }
  mkdirSync(outDir, { recursive: true });
  mkdirSync(tempDir, { recursive: true });

  let written = 0;
  let skipped = 0;
  let failed = 0;
  console.log(`Unit-class TTS — ${filteredJobs.length} lines`);
  for (let index = 0; index < filteredJobs.length; index++) {
    const job = filteredJobs[index];
    const destination = join(outDir, job.file);
    const label = `[${index + 1}/${filteredJobs.length}] ${job.file} [${job.voice.name}]`;
    if (!force && existsSync(destination)) {
      console.log(`${label} — skip`);
      skipped += 1;
      continue;
    }
    process.stdout.write(`${label} — generating… `);
    try {
      const encoded = await generate(job);
      const temporary = join(tempDir, `${job.file}.mp3`);
      writeFileSync(temporary, encoded);
      convert(temporary, destination);
      console.log('ok');
      written += 1;
      await sleep(350);
    } catch (error) {
      console.log('FAIL');
      console.error(`  ${error.message}`);
      failed += 1;
      if (/401|429|quota|credit/i.test(String(error.message))) break;
      await sleep(850);
    }
  }
  console.log(`Done — wrote ${written}, skipped ${skipped}, failed ${failed}`);
  if (failed) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
