export type PlannedWorkoutDay = 'monday' | 'wednesday' | 'friday'

export interface WorkoutDefinition {
  id: string
  title: string
  plannedDay: PlannedWorkoutDay
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
  bloating: number
  urges: number
  bristolType: number | null
  shampoo: boolean
  minoxidil: boolean
  scalpNotes: ScalpNote[]
  scalpOtherNote: string
  alcoholChoice: AlcoholChoice | null
  beerAmountChoice: BeerAmountChoice | null
  alcoholAmount: string
  alcoholReasons: AlcoholReason[]
  alcoholOtherReason: string
  replacedCan: boolean | null
  replacement: string
  soberEveningRating: number | null
  completed: boolean
  createdAt: string
  updatedAt: string
}

export interface HealthState {
  schemaVersion: 2
  entries: Record<string, HealthEntry>
}
