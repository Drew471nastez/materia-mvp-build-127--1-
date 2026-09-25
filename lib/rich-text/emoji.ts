/**
 * The emoji the description field offers, in the order a picker shows them.
 *
 * A short list rather than all of Unicode: the ones people actually put in a
 * product description (faces, hands, hearts, ticks and arrows, the things a
 * digital product is about), each with the words it is found by. The
 * characters are ordinary text, so nothing about storing or drawing a
 * description changes: the allow list keeps text as text.
 */

export interface EmojiGroup {
  id: string
  name: string
  /** The emoji that stands for the group on its tab. */
  icon: string
  /** `emoji words…` pairs, one per entry. */
  items: Array<[string, string]>
}

const g = (id: string, name: string, icon: string, raw: string): EmojiGroup => ({
  id,
  name,
  icon,
  items: raw
    .trim()
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const space = line.indexOf(" ")
      return [line.slice(0, space), line.slice(space + 1)] as [string, string]
    }),
})

export const EMOJI_GROUPS: EmojiGroup[] = [
  g("smileys", "Smileys", "😀", `
😀 grinning smile happy
😃 smiley happy joy
😄 smile happy laugh
😁 grin beaming
😆 laughing squint
😅 sweat smile relief
🤣 rofl rolling laughing
😂 joy tears laughing
🙂 slight smile
🙃 upside down silly
😉 wink
😊 blush smile happy
😇 innocent halo angel
🥰 love hearts adore
😍 heart eyes love
🤩 star struck wow amazing
😘 kiss blow
😋 yum delicious tasty
😛 tongue playful
😜 wink tongue crazy
🤪 zany crazy
😎 cool sunglasses
🤓 nerd glasses smart
🧐 monocle curious
🤔 thinking hmm
🤨 raised eyebrow skeptical
😐 neutral meh
😑 expressionless
😶 no mouth silent
🙄 eye roll
😏 smirk
😌 relieved calm
😴 sleeping tired zzz
🤤 drooling
😪 sleepy
😮 open mouth surprised
😯 hushed
😲 astonished shocked
🥳 party celebrate birthday
🤯 mind blown exploding
😳 flushed embarrassed
🥺 pleading puppy eyes
😢 cry sad tear
😭 sob crying
😤 triumph huff
😠 angry mad
😡 rage furious
🤬 cursing swearing
😱 scream fear
😨 fearful
😰 anxious sweat
🤗 hug hugging
🤭 giggle oops hand over mouth
🤫 shush quiet secret
🤐 zipper mouth secret
🥲 smile tear grateful
🫠 melting
🫡 salute respect
😬 grimace awkward
🤑 money mouth rich
🤠 cowboy
😈 devil smiling
👻 ghost
💀 skull dead
🤖 robot bot ai
👽 alien
💩 poop
`),
  g("people", "Hands and people", "👋", `
👋 wave hello hi bye
🤚 raised back hand
✋ raised hand stop high five
🖐️ hand fingers splayed
👌 ok perfect
🤌 pinched fingers
✌️ victory peace
🤞 crossed fingers luck
🫶 heart hands love
🤟 love you gesture
🤘 rock on horns
🤙 call me shaka
👈 point left
👉 point right
👆 point up
👇 point down
☝️ index up
👍 thumbs up like yes
👎 thumbs down dislike no
✊ fist raised
👊 fist bump punch
👏 clap applause bravo
🙌 raised hands hooray celebrate
👐 open hands
🤲 palms up
🤝 handshake deal agreement
🙏 pray thanks please
✍️ writing hand
💅 nail polish
💪 muscle strong flex
🧠 brain smart think
👀 eyes look watch
👁️ eye
👄 mouth lips
🗣️ speaking head talk
👤 person silhouette user
👥 people users group
🧑‍💻 technologist coder developer laptop
🧑‍🎨 artist painter designer
🧑‍🎤 singer musician
🧑‍🏫 teacher
🧑‍💼 office worker business
🧑‍🍳 cook chef
🧑‍🚀 astronaut
🧑‍🎓 student graduate
🙋 raising hand question
🤷 shrug dunno
🤦 facepalm
💁 information desk
🙆 ok gesture
🙅 no gesture
🏃 running fast
💃 dancer dance
🕺 dancing man
`),
  g("hearts", "Hearts and symbols", "❤️", `
❤️ red heart love
🧡 orange heart
💛 yellow heart
💚 green heart
💙 blue heart
💜 purple heart
🖤 black heart
🤍 white heart
🤎 brown heart
💔 broken heart
❣️ heart exclamation
💕 two hearts
💞 revolving hearts
💓 beating heart
💗 growing heart
💖 sparkling heart
💘 heart arrow cupid
💝 heart ribbon gift
✨ sparkles magic new shine
⭐ star favorite
🌟 glowing star
💫 dizzy star
⚡ lightning zap fast energy
🔥 fire hot lit popular
💥 boom collision
💯 hundred perfect score
✅ check done yes tick complete
☑️ ballot check
✔️ check mark
❌ cross no wrong
❎ cross button
➕ plus add
➖ minus
✖️ multiply
❓ question
❗ exclamation important
‼️ double exclamation
⚠️ warning caution
🚫 prohibited no
⛔ no entry
🔴 red circle
🟠 orange circle
🟡 yellow circle
🟢 green circle
🔵 blue circle
🟣 purple circle
⚫ black circle
⚪ white circle
🔶 orange diamond
🔷 blue diamond
➡️ right arrow
⬅️ left arrow
⬆️ up arrow
⬇️ down arrow
↗️ up right arrow
↘️ down right arrow
🔄 repeat refresh update
🔁 repeat loop
🔀 shuffle
▶️ play
⏸️ pause
⏹️ stop
⏭️ next track
⏮️ previous track
🔊 speaker loud volume
🔇 mute
🎵 music note
🎶 notes music
💬 speech bubble chat comment
💭 thought bubble
🗯️ anger bubble
🆕 new
🆓 free
🆗 ok
🆙 up
🔝 top
🔜 soon
©️ copyright
®️ registered
™️ trademark
#️⃣ hash number
`),
  g("nature", "Nature", "🌿", `
🌱 seedling grow sprout
🌿 herb leaf plant
☘️ shamrock
🍀 four leaf clover luck
🌵 cactus
🌴 palm tree beach
🌲 evergreen tree
🌳 tree
🍂 fallen leaf autumn
🍁 maple leaf fall
🌸 cherry blossom flower spring
🌺 hibiscus flower
🌻 sunflower
🌹 rose flower
🌷 tulip
💐 bouquet flowers
🌼 blossom
🌞 sun face sunny
☀️ sun sunny bright
🌤️ sun small cloud
⛅ partly cloudy
☁️ cloud
🌧️ rain
⛈️ storm thunder
❄️ snowflake cold winter
☃️ snowman
🌈 rainbow
🌊 wave ocean sea
💧 droplet water
🌙 moon night
🌍 earth globe world
🌎 americas globe
🌏 asia globe
🪐 planet saturn
🌋 volcano
🏔️ mountain snow
🐶 dog puppy
🐱 cat kitty
🦊 fox
🐻 bear
🐼 panda
🐨 koala
🦁 lion
🐯 tiger
🐸 frog
🐵 monkey
🐧 penguin
🐦 bird
🦋 butterfly
🐝 bee honey
🐞 ladybug
🐢 turtle slow
🐙 octopus
🦄 unicorn magic
🐉 dragon
`),
  g("food", "Food and drink", "🍕", `
🍎 apple red
🍏 green apple
🍊 orange tangerine
🍋 lemon
🍌 banana
🍉 watermelon
🍇 grapes
🍓 strawberry
🫐 blueberries
🍒 cherries
🍑 peach
🥭 mango
🍍 pineapple
🥥 coconut
🥑 avocado
🥦 broccoli
🥕 carrot
🌽 corn
🌶️ hot pepper spicy
🍞 bread
🥐 croissant
🧀 cheese
🥚 egg
🍳 cooking fried egg
🥞 pancakes
🥓 bacon
🍔 burger hamburger
🍟 fries
🍕 pizza
🌭 hot dog
🥪 sandwich
🌮 taco
🌯 burrito
🥗 salad healthy
🍝 spaghetti pasta
🍜 ramen noodles
🍣 sushi
🍤 shrimp
🍦 ice cream
🍩 donut doughnut
🍪 cookie
🎂 birthday cake
🍰 cake slice
🧁 cupcake
🍫 chocolate
🍬 candy
🍭 lollipop
🍯 honey
☕ coffee hot drink
🍵 tea
🧋 bubble tea boba
🥤 cup straw soda
🍺 beer
🍷 wine
🍸 cocktail
🥂 cheers toast champagne
🍾 champagne bottle celebrate
`),
  g("activity", "Activity", "🎉", `
🎉 party popper celebrate tada
🎊 confetti ball
🎈 balloon
🎁 gift present
🎀 ribbon bow
🏆 trophy winner champion
🥇 gold medal first
🥈 silver medal second
🥉 bronze medal third
🏅 medal
🎖️ military medal
🎯 target goal direct hit
🎮 video game controller gaming
🕹️ joystick arcade
🎲 dice game
🧩 puzzle piece
♟️ chess pawn strategy
🎨 art palette paint design
🖌️ paintbrush
🖍️ crayon
🎭 theater masks
🎬 clapper film movie
🎤 microphone sing podcast
🎧 headphones music audio
🎼 musical score
🎹 piano keyboard
🥁 drum
🎸 guitar
🎺 trumpet
🎻 violin
🪘 long drum
📸 camera flash photo
⚽ soccer football
🏀 basketball
🏈 american football
⚾ baseball
🎾 tennis
🏐 volleyball
🏓 ping pong
🥊 boxing glove
🏋️ weight lifting gym
🧘 yoga meditation
🚴 cycling bike
🏄 surfing
⛷️ skiing
🏁 checkered flag finish
`),
  g("travel", "Travel and places", "🚀", `
🚀 rocket launch
✈️ airplane flight travel
🛫 departure
🚗 car
🚕 taxi
🚌 bus
🚆 train
🚲 bicycle
🛵 scooter
⛵ sailboat
🚢 ship
🗺️ world map
🧭 compass
🏠 house home
🏡 house garden
🏢 office building
🏬 department store shop
🏪 convenience store
🏫 school
🏥 hospital
🏦 bank
🏨 hotel
⛺ tent camping
🏖️ beach
🏝️ island
🏜️ desert
🗽 statue of liberty
🗼 tokyo tower
🏰 castle
🎡 ferris wheel
🎢 roller coaster
🌆 city dusk
🌃 night city
🌉 bridge night
📍 pin location
🚦 traffic light
⏰ alarm clock
⌛ hourglass time
⏳ hourglass flowing
📅 calendar date
🗓️ spiral calendar
`),
  g("objects", "Objects", "💡", `
💡 bulb idea tip
📱 phone mobile
💻 laptop computer
🖥️ desktop computer
⌨️ keyboard
🖱️ mouse
🖨️ printer
💾 floppy save
💿 cd disc
📀 dvd
🎥 movie camera video
📷 camera photo
📹 video camera
📺 tv television
📻 radio
🔋 battery
🔌 plug
🔦 flashlight
🕯️ candle
📚 books library learn
📖 open book read
📘 blue book
📓 notebook
📒 ledger
📃 page curl
📄 page document
📑 bookmark tabs
📰 newspaper news
🗞️ rolled newspaper
🏷️ label tag price
🔖 bookmark
💰 money bag
💵 dollar banknote
💶 euro banknote
💷 pound banknote
💳 credit card payment
🧾 receipt
💸 money wings spend
📈 chart up growth increase
📉 chart down decrease
📊 bar chart stats analytics
📋 clipboard
📌 pushpin
📎 paperclip attach
✂️ scissors cut
🖊️ pen
✏️ pencil edit
📝 memo note write
📁 folder
📂 open folder
🗂️ dividers
🗃️ card file box
🗄️ file cabinet
🗑️ trash delete
🔒 lock locked secure
🔓 unlocked open
🔑 key
🗝️ old key
🔨 hammer build
🛠️ tools
⚙️ gear settings
🧰 toolbox
🧲 magnet
🧪 test tube experiment
🔬 microscope science
🔭 telescope
📡 satellite dish
💉 syringe
💊 pill
🛒 shopping cart
🛍️ shopping bags
📦 package box shipping
📫 mailbox
✉️ envelope email mail
📧 email
📨 incoming envelope
📩 envelope arrow
📮 postbox
🔔 bell notification
📣 megaphone announce
📢 loudspeaker
🎟️ ticket admission
🏷️ tag sale
💎 gem diamond premium
👑 crown king queen
⌚ watch
📿 prayer beads
🧸 teddy bear
🪄 magic wand
🔮 crystal ball
`),
]

const RECENTS_KEY = "storelib:emoji-recents"
const RECENTS_MAX = 24

/** The emoji this person picked lately, most recent first. Empty when storage is unavailable. */
export function readRecentEmoji(): string[] {
  try {
    const raw = window.localStorage.getItem(RECENTS_KEY)
    const list = raw ? (JSON.parse(raw) as unknown) : []
    return Array.isArray(list) ? list.filter((e): e is string => typeof e === "string").slice(0, RECENTS_MAX) : []
  } catch {
    return []
  }
}

export function rememberEmoji(emoji: string): string[] {
  const next = [emoji, ...readRecentEmoji().filter((e) => e !== emoji)].slice(0, RECENTS_MAX)
  try {
    window.localStorage.setItem(RECENTS_KEY, JSON.stringify(next))
  } catch {
    /* a private window: recents just are not kept */
  }
  return next
}

/** Emoji whose words start with, then contain, the query. */
export function searchEmoji(query: string): string[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  const starts: string[] = []
  const inside: string[] = []
  for (const group of EMOJI_GROUPS) {
    for (const [emoji, words] of group.items) {
      const w = ` ${words}`
      if (w.includes(` ${q}`)) starts.push(emoji)
      else if (words.includes(q)) inside.push(emoji)
    }
  }
  return [...new Set([...starts, ...inside])].slice(0, 120)
}
