import { JSX } from 'preact/jsx-runtime'
import { render } from 'preact'

import GeneratorPanel, { GeneratorPanelState } from './components/GeneratorPanel'
import EntryList from './components/EntryList'
import EntryView from './components/EntryView'

// The frame component.
const Frame = (): JSX.Element => {
  return (
    <div style={{ transform: (GeneratorPanelState.isActive.value) ? 'translateY(-100dvh)' : 'translateY(0dvh)', transition: 'transform 0.5s var(--ease-outQuint)' }}>
      <div style={{ display: 'flex', width: '100dvw', height: '100dvh' }}>
        <EntryList style={{ flex: 3, border: 'var(--border-style-muted)', borderStyle: 'none solid none none', minWidth: '25rem' }}/>
        <EntryView style={{ flex: 6, minWidth: '50rem' }}/>
      </div>

      <GeneratorPanel style={{ height: '100dvh' }}/>
    </div>
  )
}

// setTimeout(() => {
//   GeneratorPanelState.isActive.value = true
//   GeneratorPanelState.setCurrentStep({ step: 'rendering' })
// }, 500)

render(<Frame/>, document.getElementById('container-frame')!)
