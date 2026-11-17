import { signal, batch } from '@preact/signals'
import { JSX } from 'preact/jsx-runtime'
import { CSSProperties } from 'preact'
import * as lucid from 'lucide-preact'

import { GeneratorPanelState } from './GeneratorPanel'

// The state of the entry list.
export class EntryListState {
  public static summary = signal<null | {
    classes: { id: number, name: string }[],

    trainPartitionSize: number,
    validationPartitionSize: number
  }>(null)

  public static summaryLocked = signal<boolean>(true)
  public static summaryStatus = signal<string>('Loading...')

  public static pageContent = signal<null | {
    entries: Entry[],
    currentPage: number,
    totalResults: number
  }>(null)

  public static pageContentLocked = signal<boolean>(true)
  public static pageContentStatus = signal<string>('Loading...')

  public static selectedPartition = signal<'train' | 'validation'>('train')
  public static selectedClassID = signal<null | string>(null)
  public static selectedEntries = signal<number[]>([])

  // Load the summary.
  public static async loadSummary(): Promise<void> {
    batch(() => {
      this.summaryLocked.value = true
      this.summaryStatus.value = 'Loading...'
    })

    try {
      const summaryResponse = await fetch('/api/summary')

      if (summaryResponse.status !== 200) {
        batch(() => {
          this.summary.value = null
          this.summaryLocked.value = false
          this.summaryStatus.value = 'Server Error'
        })

        return 
      }

      const summaryData = await summaryResponse.json()

      batch(() => {
        this.summary.value = {
          classes: summaryData.classes,

          trainPartitionSize: summaryData.train_partition_size,
          validationPartitionSize: summaryData.validation_partition_size
        }

        this.summaryLocked.value = false
      })
    } catch (error) {
      console.error(error)

      batch(() => {
        this.summary.value = null
        this.summaryLocked.value = false
        this.summaryStatus.value = 'Client Error'
      })
    }
  }

  // Load the page content.
  public static async loadPageContent(page: number): Promise<void> {
    if (this.summary.value === null) {
      await this.loadSummary() 
    }

    batch(() => {
      this.pageContentLocked.value = true
      this.pageContentStatus.value = 'Loading...'
    })

    const partition = this.selectedPartition.value

    try {
      const pageResponseResponse = await fetch((this.selectedClassID.value === null) ? `/api/list?partition=${this.selectedPartition.value}&page=${page}` : `/api/list?partition=${this.selectedPartition.value}&class_id=${this.selectedClassID.value}&page=${page}`)

      if (pageResponseResponse.status !== 200) {
        batch(() => {
          this.pageContent.value = null
          this.pageContentLocked.value = false
          this.pageContentStatus.value = 'Server Error'
        })
      }

      const pageContentData = await pageResponseResponse.json()

      if (pageContentData.entries.length === 0 && page > 1) {
        return await this.loadPageContent(Math.floor(pageContentData.total_results / 30) + 1)
      }

      batch(() => {
        const previousEntries: null | Entry[] = (this.pageContent.value === null) ? null : this.pageContent.value.entries

        this.pageContent.value = {
          entries: pageContentData.entries.map((entry: any) => {
            const labels = entry.labels.map((label: any) => {
              return {
                className: this.getClassName(label.class_id),
                centerX: label.center_x,
                centerY: label.center_y,
                width: label.width,
                height: label.height
              }
            })

            const classes = new Map<number, number>()

            for (const label of entry.labels) {
              classes.set(label.class_id, (classes.has(label.class_id)) ? classes.get(label.class_id)! + 1 : 1)
            } 

            return {
              partition,
              id: entry.id,
              labels: labels,
              classes: Array.from(classes.keys()).sort((a, b) => classes.get(b)! - classes.get(a)!)
            }
          }),

          currentPage: pageContentData.current_page,
          totalResults: pageContentData.total_results
        }

        if (previousEntries !== null) {
          const newSelectedEntries: number[] = []

          for (const entryID of this.selectedEntries.value.map((index) => previousEntries[index].id)) {
            const entryIndex = this.getEntryIndex(entryID)

            if (entryIndex !== null) {
              newSelectedEntries.push(entryIndex)
            }
          }

          this.selectedEntries.value = newSelectedEntries
        } else {
          this.selectedEntries.value = []
        }

        this.pageContentLocked.value = false
      })
    } catch (error) {
      console.error(error)

      batch(() => {
        this.pageContent.value = null
        this.pageContentLocked.value = false
        this.pageContentStatus.value = 'Client Error'
      })
    }    
  }

  // Get the index of an entry.
  public static getEntryIndex(id: string): null | number {
    if (this.pageContent.value !== null) {
      for (let index = 0; index < this.pageContent.value.entries.length; index++) {
        if (this.pageContent.value.entries[index].id === id) {
          return index
        }
      }
    }

    return null
  }

  // Check if a class exists by the name.
  public static hasClass(name: string): boolean {
    if (this.summary.value !== null) {
      for (const classInfo of this.summary.value.classes) {
        if (classInfo.name === name) {
          return true
        }
      }
    }

    return false
  }

  // Find the name of a class.
  public static getClassName(id: number): string {
    if (this.summary.value !== null) {
      for (const classInfo of this.summary.value.classes) {
        if (classInfo.id === id) {
          return classInfo.name
        }
      }
    }

    return 'Unknown'
  }
}

let shiftPressed: boolean = false

// The entry list component.
export default (properties: { style?: CSSProperties }): JSX.Element => {

  // Update the selected entries.
  const updateSelectedEntries = (index: number): void => {
    if (shiftPressed && EntryListState.selectedEntries.value.length > 0) {
      if (index > EntryListState.selectedEntries.value[0]) {
        EntryListState.selectedEntries.value = Array.from({ length: (index - EntryListState.selectedEntries.value[0]) + 1 }, (_, currentIndex) => EntryListState.selectedEntries.value[0] + currentIndex)
      } else {
        EntryListState.selectedEntries.value = Array.from({ length: (EntryListState.selectedEntries.value[0] + 1) - index }, (_, currentIndex) => EntryListState.selectedEntries.value[0] - currentIndex)
      }
    } else if (EntryListState.selectedEntries.value.length === 1 && EntryListState.selectedEntries.value[0] === index) {
      EntryListState.selectedEntries.value = []
    } else {
      EntryListState.selectedEntries.value = [index]
    }
  }

  // Update the search class ID.
  const updateClassID = (classID: string): void => {
    // An "@" is added to the start of the value for the options to avoid name conflic with the "all" (All Classes) value.

    EntryListState.selectedClassID.value = (classID === 'all') ? null : classID.substring(1)
  }

  /// List the classes to display.
  const listDisplayClasses = (entry: { id: string, labels: Label[], classes: number[] }): string[] => {
    const classes = entry.classes.slice(0, 3).map((classID) => EntryListState.getClassName(classID))

    if (EntryListState.selectedClassID.value !== null && classes.includes(EntryListState.selectedClassID.value)) {
      classes.push(EntryListState.selectedClassID.value)
    }

    return classes
  }

  // Let the user choose an image file.
  const chooseImageFile = (): void => {
    const inputElement = document.createElement('input')

    inputElement.type = 'file'
    inputElement.accept = 'image/jpeg,image/png,image/webp'

    inputElement.addEventListener('change', (event) => {
      const imageFile = (event.target as HTMLInputElement).files![0]

      batch(() => {
        GeneratorPanelState.setCurrentStep({
          step: 'labeling',

          selectedImageURL: URL.createObjectURL(imageFile),
          selectedImageBlob: imageFile,

          objects: []
        })

        GeneratorPanelState.isActive.value = true
      })
    })

    inputElement.click()
  }

  /// Handle file drop.
  const handleFileDrop = (event: DragEvent) => {
    event.preventDefault()

    const imageFile = event.dataTransfer!.files.item(0)!

    if (['image/jpeg', 'image/png', 'image/webp'].includes(imageFile.type)) {
      batch(() => {
        GeneratorPanelState.setCurrentStep({
          step: 'labeling',

          selectedImageURL: URL.createObjectURL(imageFile),
          selectedImageBlob: imageFile,

          objects: []
        })

        GeneratorPanelState.isActive.value = true
      })
    } else {
      confirm('The file must be a JPEG, PNG or WebP image.')
    }
  }

  return (
    <div style={Object.assign({ display: 'flex', flexDirection: 'column', backgroundColor: 'var(--color-container-dark)' }, (properties.style === undefined) ? {} : properties.style)}>
      <div style={{ display: 'flex', border: 'var(--border-style-muted)', borderStyle: 'none none solid none', height: '3rem' }}>
        <button onClick={() => EntryListState.selectedPartition.value = 'train'} class='button-muted' style={{ flex: 1, backgroundColor: (EntryListState.selectedPartition.value === 'train') ? 'var(--color-highlight-muted)' : undefined, border: 'var(--border-style-muted)', borderStyle: 'none solid none none', textAlign: 'center' }}>
          <p style={{ marginBottom: 'var(--space-tiny)', userSelect: 'none', pointerEvents: 'none' }}>Train</p>

          {
            (EntryListState.summary.value === null) ? (
              <p style={{ fontSize: 'calc(var(--size-tiny) * 0.9)', opacity: 0.5, userSelect: 'none', pointerEvents: 'none' }}>(Loading...)</p>
            ) : (
              <p style={{ fontSize: 'calc(var(--size-tiny) * 0.9)', opacity: 0.5, userSelect: 'none', pointerEvents: 'none' }}>({EntryListState.summary.value.trainPartitionSize} Entries)</p>
            )
          }          
        </button>

        <button onClick={() => EntryListState.selectedPartition.value = 'validation'} class='button-muted' style={{ flex: 1, backgroundColor: (EntryListState.selectedPartition.value === 'validation') ? 'var(--color-highlight-muted)' : undefined, border: 'none', textAlign: 'center', }}>
          <p style={{ marginBottom: 'var(--space-tiny)', userSelect: 'none', pointerEvents: 'none' }}>Validation</p>

          {
            (EntryListState.summary.value === null) ? (
              <p style={{ fontSize: 'calc(var(--size-tiny) * 0.9)', opacity: 0.5, userSelect: 'none', pointerEvents: 'none' }}>(Loading...)</p>
            ) : (
              <p style={{ fontSize: 'calc(var(--size-tiny) * 0.9)', opacity: 0.5, userSelect: 'none', pointerEvents: 'none' }}>({EntryListState.summary.value.validationPartitionSize} Entries)</p>
            )
          }
        </button>
      </div>

      {
        (EntryListState.pageContent.value === null) ? (
          <div style={{ flex: 1, alignContent: 'center', padding: 'var(--size-medium)' }}>
            <p style={{ textAlign: 'center', opacity: 0.5 }}>{EntryListState.pageContentStatus}</p>
          </div>
        ) : (EntryListState.pageContent.value.entries.length === 0) ? (
          <div style={{ flex: 1, alignContent: 'center', padding: 'var(--size-medium)' }}>
            <p style={{ textAlign: 'center', opacity: 0.5 }}>Empty Partition</p>
          </div>
        ) : (
          <div style={{ flex: 1, outline: 'none', display: 'flex', flexDirection: 'column', border: 'none', padding: '0rem', overflow: 'auto' }}>
            {
              EntryListState.pageContent.value.entries.map((entry, index) => (
                <button class='button-transparent' disabled={EntryListState.pageContentLocked.value} onClick={() => updateSelectedEntries(index)} value={entry.id} style={{ display: 'flex', alignItems: 'center', backgroundColor: (EntryListState.selectedEntries.value.includes(index)) ? 'var(--color-highlight-muted)' : undefined, padding: 'var(--space-small)', pointerEvents: (EntryListState.pageContentLocked.value) ? 'none' : 'auto' }}>
                  <lucid.Image size={20} style={{ flexShrink: 0, marginRight: 'var(--space-small)' }}/>
                  <p style={{ flex: 1, textAlign: 'start', transform: 'translateY(0.1rem)' }}>{entry.id}</p>

                  {
                    listDisplayClasses(entry).map((className) => (
                      <p class={(EntryListState.selectedEntries.value.includes(index)) ? 'container-solid-bright' : 'container-solid-muted'} style={{ borderRadius: 'var(--border-radius-small)', fontSize: 'var(--size-tiny)', padding: 'calc(var(--space-tiny) * 0.5)', marginLeft: 'var(--space-tiny)', transition: 'background-color 0.5s var(--ease-outQuint), border 0.5s var(--ease-outQuint)' }}>{className}</p>
                    ))
                  }
                </button>
              ))
            }

            <Pagination style={{ border: 'var(--border-style-dark)', borderStyle: 'solid none none none', paddingTop: 'var(--space-medium)' }}/>
          </div>
        )
      }

      <div class='container-solid-muted' style={{ display: 'flex', borderStyle: 'solid none none none', height: '3rem' }}>
        <div style={{ flex: 1, border: 'var(--border-style-muted)', borderStyle: 'none solid none none', paddingInline: 'var(--space-medium)' }}>
          {
            (EntryListState.summary.value === null) ? (
              <select disabled={true} style={{ color: 'color-mix(in srgb, var(--color-foreground), transparent 50%)', backgroundColor: 'transparent', border: 'none', fontSize: 'var(--size-small)', width: '100%', height: '100%', cursor: 'not-allowed' }}>
                <option>{EntryListState.summaryStatus.value}</option>
              </select>
            ) : (
              <select value={(EntryListState.selectedClassID.value === null) ? 'all' : '@' + EntryListState.selectedClassID.value} disabled={EntryListState.summaryLocked.value || EntryListState.pageContentLocked.value} onChange={(event) => updateClassID((event.target as HTMLSelectElement).value)} style={{ color: (EntryListState.summaryLocked.value || EntryListState.pageContentLocked.value) ? 'color-mix(in srgb, var(--color-foreground), transparent 50%)' : 'var(--color-foreground)', backgroundColor: 'transparent', border: 'none', fontSize: 'var(--size-small)', width: '100%', height: '100%', cursor: (EntryListState.summaryLocked.value) ? 'not-allowed' : 'pointer' }}>
                {
                  [(<option value='all'>All Classes</option>)].concat(EntryListState.summary.value.classes.map((classInfo) => (<option value={'@' + classInfo.id}>{classInfo.name}</option>)))
                }
              </select>
            )
          } 
        </div>

        <button title="Generate Dataset" onClick={chooseImageFile} onDragOver={(event) => event.preventDefault()} onDrop={handleFileDrop} class='button-transparent' style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', width: '3rem', height: '3rem' }}>
          <lucid.Plus/>
        </button>
      </div>
    </div>
  )
}

// The pagination component.
const Pagination = (properties: { style?: CSSProperties }): null | JSX.Element => {
  if (EntryListState.pageContent.value === null) {
    return (<div style={properties.style}></div>)
  }

  const pages: number[] = []
  const content = EntryListState.pageContent.value

  for (let i = Math.max(1, EntryListState.pageContent.value.currentPage - 4); i < EntryListState.pageContent.value.currentPage; i++) {
    pages.push(i)
  }

  pages.push(EntryListState.pageContent.value.currentPage)

  for (let i = EntryListState.pageContent.value.currentPage + 1; i < Math.min(Math.ceil(EntryListState.pageContent.value.totalResults / 30), EntryListState.pageContent.value.currentPage + 5); i++) {
    pages.push(i)
  }

  // Switch a page.
  const switchPage = (page: number): void => {
    if (EntryListState.pageContent.value!.currentPage) {
      Promise.all([
        EntryListState.loadSummary(),
        EntryListState.loadPageContent(page)
      ])
    }
  }

  return (
    <div style={Object.assign({ display: 'flex', justifyContent: 'center', gap: 'var(--space-small)' }, (properties.style === undefined) ? {} : properties.style)}>
      <button onClick={() => switchPage(1)} class='button-muted' style={{ borderRadius: 'var(--border-radius-small)', padding: 'calc(var(--space-tiny) * 0.5) var(--space-tiny)' }}>&lt;&lt;</button>
      <button onClick={() => switchPage(Math.max(1, content.currentPage - 1))} class='button-muted' style={{ borderRadius: 'var(--border-radius-small)', padding: 'calc(var(--space-tiny) * 0.5) var(--space-tiny)' }}>&lt;</button>

      {
        pages.map((page) => (
          <button onClick={() => switchPage(page)} class='button-muted' style={{ backgroundColor: (page === content.currentPage) ? 'var(--color-highlight-muted)' : undefined, border: (page === content.currentPage) ? 'var(--border-style-bright)' : 'var(--border-style-muted)', borderRadius: 'var(--border-radius-small)', padding: 'calc(var(--space-tiny) * 0.5) var(--space-tiny)' }}>{page}</button>
        ))
      }

      <button onClick={() => switchPage(Math.max(1, Math.min(Math.ceil(content.totalResults / 30), content.currentPage + 1)))} class='button-muted' style={{ borderRadius: 'var(--border-radius-small)', padding: 'calc(var(--space-tiny) * 0.5) var(--space-tiny)' }}>&gt;</button>
      <button onClick={() => switchPage(Math.max(1, Math.ceil(content.totalResults / 30) ))} class='button-muted' style={{ borderRadius: 'var(--border-radius-small)', padding: 'calc(var(--space-tiny) * 0.5) var(--space-tiny)' }}>&gt;&gt;</button>
    </div>
  )
}

EntryListState.loadPageContent(1)
EntryListState.selectedPartition.subscribe(() => EntryListState.loadPageContent(1))
EntryListState.selectedClassID.subscribe(() => EntryListState.loadPageContent(1))

window.addEventListener('keydown', (event) => {
  if (event.key === 'Shift' && (event.target as HTMLElement).tagName !== 'input') {
    shiftPressed = true
  }
})

window.addEventListener('keyup', (event) => {
  if (event.key === 'Shift' && (event.target as HTMLElement).tagName !== 'input') {
    shiftPressed = false
  }
})

window.addEventListener('blur', () => shiftPressed = false)

// An entry.
interface Entry {
  partition: string,
  id: string,
  labels: Label[],
  classes: number[]
}

// A label.
interface Label {
  className: string,
  centerX: number,
  centerY: number,
  width: number,
  height: number
}
