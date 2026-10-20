let place = { from: 1, to: 1 }

export function captureTemplatePlace(from: number, to: number) {
  place = { from, to }
}

export function templatePlace() {
  return place
}
