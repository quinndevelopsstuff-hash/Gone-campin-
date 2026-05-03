/*
 * ============================================================
 *  Gone Campin' — Game Logic (script.js)
 *  Shared across index.html, setup.html, and game.html
 * ============================================================
 *
 * GAME STATE
 *   - survivorName     : string — entered on setup.html
 *   - selectedBiome    : string — one of: forest | desert | tundra | swamp
 *   - currentDay       : integer — increments each time all 3 phases complete
 *   - currentPhase     : string — one of: morning | afternoon | night
 *   - actionPoints     : integer — replenished each phase, consumed by actions
 *
 * STATS  (each 0–100)
 *   - health    : reaches 0 → game over
 *   - hunger    : drains each phase; very low → health drain
 *   - thirst    : drains faster than hunger; very low → health drain
 *   - energy    : low energy reduces AP granted next phase
 *   - warmth    : drops at night and in cold biomes; very low → health drain
 *
 * INVENTORY
 *   - items[]   : array of { id, name, quantity, category }
 *   - categories: material | food | water | tool | medicine | fuel
 *
 * CRAFTING SYSTEM
 *   - recipes[]  : each recipe defines required items + quantities → output item
 *   - craftItem(recipeId) : validates inventory, consumes inputs, grants output
 *   - unlockable recipes gated by tool tier (bare-hands → knife → axe)
 *
 * DAY / NIGHT CYCLE
 *   - advancePhase()    : morning → afternoon → night → (next day) morning
 *   - each phase applies passive stat decay (hunger, thirst, energy, warmth)
 *   - night phase: warmth decays faster, certain actions unavailable
 *   - biome modifiers affect decay rates (e.g. tundra accelerates warmth loss)
 *
 * ACTIONS
 *   - forage(type)      : search for food/water/materials; cost varies by biome
 *   - buildShelter()    : reduces warmth decay at night; multi-stage construction
 *   - rest()            : restores energy; costs no AP but advances time
 *   - explore()         : chance to find rare materials or trigger events
 *   - useCraftedItem()  : applies item effects (e.g. bandage → +health)
 *   - buildSignalFire() : win condition; requires specific materials at camp
 *
 * RANDOM EVENTS
 *   - triggered at phase start with weighted probability
 *   - event pool filtered by biome and current day (difficulty scales)
 *   - example events: rainstorm, predator encounter, injury, windfall cache,
 *     lost gear, sudden cold snap, mysterious stranger
 *
 * ACHIEVEMENTS
 *   - tracked in localStorage as { id: boolean }
 *   - example achievements:
 *       "First Night" — survive your first night
 *       "Well Fed"    — reach day 5 without hunger dropping below 20
 *       "MacGyver"    — craft 10 unique items
 *       "Rescue"      — build and light the Signal Fire (win)
 *       "Barely Made It" — win with health ≤ 5
 *       "Ghost"       — survive 20 days without being found
 *
 * PERSISTENCE
 *   - game state serialized to localStorage on every phase advance
 *   - loadGame() / saveGame() helpers
 *   - setup.html writes survivorName + biome; game.html reads on init
 *
 * UI HELPERS (to be implemented in game.html inline script or here)
 *   - renderStats()     : update .stat-bar__fill widths + color classes
 *   - renderInventory() : populate inventory panel
 *   - renderLog(msg)    : append message to the event log with timestamp
 *   - showModal(data)   : display random event or crafting overlay
 * ============================================================
 */
