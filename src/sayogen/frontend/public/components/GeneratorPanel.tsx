import { signal } from '@preact/signals'
import { JSX } from 'preact/jsx-runtime'
import { CSSProperties } from 'preact'

import { EntryListState } from './EntryList'
import RenderingStep from './RenderingStep'
import LabelingStep from './LabelingStep'

// The state of the generator panel.
export class GeneratorPanelState {
  public static isActive = signal<boolean>(false)
  public static currentStep = signal<GeneratorStep>({ step: 'none' })

  // Set the current step.
  public static setCurrentStep(step: GeneratorStep): void {
    if (this.currentStep.value.step == 'labeling') {
      URL.revokeObjectURL(this.currentStep.value.selectedImageURL)
    }

    this.currentStep.value = step
  }

  // Update the selection step.
  public static updateSelectionStep(step: Partial<SelectionStep>): void {
    if (this.currentStep.value.step == 'labeling') {
      this.currentStep.value = { ...this.currentStep.value, ...step }
    }
  }

  // Update the rendering step.
  public static updateRenderingStep(step: Partial<RenderingStep>): void {
    if (this.currentStep.value.step == 'rendering') {
      this.currentStep.value = { ...this.currentStep.value, ...step }
    }
  }
}

// The generator panel component.
export default (properties: { style?: CSSProperties }): JSX.Element => {
  if (GeneratorPanelState.currentStep.value.step == 'labeling' && EntryListState.summary.value !== null) {
    return (<LabelingStep {...properties}/>)
  }

  if (GeneratorPanelState.currentStep.value.step == 'rendering') {
    return (<RenderingStep {...properties}/>)
  }

  return (
    <div style={Object.assign({ display: 'flex', justifyContent: 'center', alignItems: 'center' }, (properties.style === undefined) ? {} : properties.style)}>
      <p style={{ opacity: 0.5 }}>Invalid Generator State</p>
    </div>
  )
}

// A generator step.
type GeneratorStep = { step: 'none' } | SelectionStep | RenderingStep

// The selection step.
interface SelectionStep {
  step: 'labeling',

  selectedImageURL: string,
  selectedImageBlob: Blob,

  objects: {
    className: string,
    points: { x: number, y: number }[],

    maskImage: null | HTMLImageElement
    lastUpdateTimestamp: null | number,
  }[]
}

// The rendering step.
interface RenderingStep {
  step: 'rendering'
}
