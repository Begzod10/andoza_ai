/** Shapes of the lists the landing reads from the locale files with `returnObjects`. */

/** A pain-point note; fixTitle/fixDesc are shown on the flipped (back) side. */
export interface ProblemItem {
  title: string;
  desc: string;
  fixTitle: string;
  fixDesc: string;
}

export interface ConveyorPair {
  problem: string;
  problemTip: string;
  solution: string;
  solutionTip: string;
}
