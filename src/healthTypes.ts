export type PlannedWorkoutDay =
  | 'monday'
  | 'tuesday'
  | 'wednesday'
  | 'thursday'
  | 'friday'
  | 'saturday'
  | 'sunday'

export interface WorkoutDefinition {
  id: string
  title: string
  plannedDay: PlannedWorkoutDay
  durationMinutes: number
  order: number
  active: boolean
  note: string
}

export interface SelectedWorkout {
  workoutId: string
  completedDate: string
  plannedDay: PlannedWorkoutDay
}

export interface RelaxationState {
  ninetyNinety: boolean
  childPose: boolean
  butterfly: boolean
  figureFour: boolean
}

export type ScalpNote =
  | 'none'
  | 'itching'
  | 'dryness'
  | 'redness'
  | 'other'

export type AlcoholChoice =
  | 'none'
  | 'nonAlcoholic'
  | 'beer'
  | 'wine'
  | 'other'

export type BeerAmountChoice = '1' | '2' | 'other'

export type LearningStatus = 'not_done' | 'done'
export type SpeechActivityType = 'session' | 'practice'
export type LessonActivityType = 'lesson' | 'practice'

export interface LearningDirection<TActivityType extends string> {
  status: LearningStatus | null
  activityType: TActivityType | null
  number: number | null
  note: string
}

export interface LearningState {
  speech: LearningDirection<SpeechActivityType>
  cavist: LearningDirection<LessonActivityType>
  porcelain: LearningDirection<LessonActivityType>
}

export type AlcoholReason =
  | 'relax'
  | 'habit'
  | 'stress'
  | 'taste'
  | 'company'
  | 'other'

export interface HealthEntry {
  date: string
  waterCups: number
  coffeeCups: number
  psyllium: boolean
  fruit: boolean
  toiletWithoutStraining: boolean
  morningSquats: boolean
  selectedWorkouts: SelectedWorkout[]
  workoutWellbeing: boolean
  relaxation: RelaxationState
  bloating: number | null
  urges: number | null
  bristolType: number | null
  shampoo: boolean
  minoxidil: boolean
  scalpNotes: ScalpNote[]
  scalpOtherNote: string
  alcoholChoice: AlcoholChoice | null
  beerAmountChoice: BeerAmountChoice | null
  nonAlcoholicQuantityChoice: BeerAmountChoice | null
  nonAlcoholicQuantity: number | null
  alcoholAmount: string
  alcoholReasons: AlcoholReason[]
  alcoholOtherReason: string
  replacedCan: boolean | null
  replacement: string
  soberEveningRating: number | null
  learning: LearningState
  /** Completed cosmetic procedure ids for this day. Schedule stays in HealthSettings. */
  cosmetology: Record<string, boolean>
  completed: boolean
  createdAt: string
  updatedAt: string
}

export interface CosmetologyDebt {
  /** Stable identity: one scheduled procedure and its original planned date. */
  id: string
  procedureId: string
  title: string
  plannedDate: string
  procedureIds: string[]
  activeDate: string | null
  completedDate: string | null
  skippedDate: string | null
}

export interface HealthState {
  schemaVersion: 6
  entries: Record<string, HealthEntry>
  /** Outstanding and resolved cosmetology plans. Kept with health data and backups. */
  cosmetologyDebts: Record<string, CosmetologyDebt>
  /** Prevents generating historical debts during the one-time migration. */
  cosmetologyDebtCheckedThrough: string | null
}
