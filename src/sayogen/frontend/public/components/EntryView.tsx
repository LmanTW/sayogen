import { JSX } from 'preact/jsx-runtime'
import { CSSProperties } from 'preact'
import * as lucid from 'lucide-preact'

import { EntryListState } from './EntryList'

// The entry view component.
export default (properties: { style?: CSSProperties }): JSX.Element => {

  // Remove all entries in the current page.
  const removeWholePage = async (): Promise<void> => {
    if (EntryListState.pageContent.value === null) {
      return
    }

    if (EntryListState.pageContent.value.entries.length > 0 && confirm('Confirm to remove all entries in the current page.')) {
      EntryListState.pageContentLocked.value = true

      for (const entry of EntryListState.pageContent.value.entries) {
        try {
          await fetch(`/api/remove?partition=${entry.partition}&entry_id=${entry.id}`, { method: 'DELETE' })
        } catch (error) {
          console.log(error)
        }
      }

      EntryListState.loadPageContent((EntryListState.pageContent.value === null) ? 1 : EntryListState.pageContent.value.currentPage)
    }
  }

  return (EntryListState.pageContent.value !== null && EntryListState.selectedEntries.value.length === 0) ? (
    <div style={Object.assign({ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: 'var(--space-medium)' }, (properties.style === undefined) ? {} : properties.style)}>
      <p style={{ opacity: 0.5 }}>No Selected Entry</p>
    </div>
  ) : (
    <div style={Object.assign({ padding: 'var(--space-medium)' }, (properties.style === undefined) ? {} : properties.style)}>
      <div style={{ display: 'flex', flexDirection: 'column', backgroundColor: 'var(--color-container-dark)', border: 'var(--border-style-muted)', borderRadius: 'var(--border-radius-big)', maxHeight: 'calc(100dvh - calc(var(--space-medium) * 2))', overflow: 'hidden' }}>
        <div class='container-solid-muted' style={{ display: 'flex', alignItems: 'center', borderStyle: 'none none solid none', height: '3rem' }}>
          <h3 style={{ flex: 1, fontSize: 'var(--size-medium)', marginInline: 'var(--space-small)' }}>Selected: {EntryListState.selectedEntries.value.length}</h3>

          <button title='Remove Whole Page' onClick={removeWholePage} class='button-transparent' style={{ flexShrink: 0, display: 'flex', justifyContent: 'center', alignItems: 'center', border: 'var(--border-style-muted)', borderStyle: 'none none none solid', width: '3rem', height: '3rem' }}>
            <lucid.Trash/>
          </button>
        </div>

        <div style={{ flex: 1, padding: 'var(--space-medium)', overflowY: 'auto' }}>
          <div style={{ columnCount: 2, columnGap: 'var(--space-medium)' }}>
            {
              EntryListState.selectedEntries.value.map((entryID, index) => {
                const entry = EntryListState.pageContent.value!.entries[entryID]
  
                // Remove the entry.
                const removeEntry = async (): Promise<void> => {
                  if (confirm('Confirm to remove the entry.')) {
                    try {
                      await fetch(`/api/remove?partition=${entry.partition}&entry_id=${entry.id}`, { method: 'DELETE' })
  
                      EntryListState.loadPageContent((EntryListState.pageContent.value === null) ? 1 : EntryListState.pageContent.value.currentPage)
                    } catch (error) {
                      console.error(error)
                    }
                  } 
                }
  
                return (
                  <div style={{ breakInside: 'avoid', border: 'var(--border-style-muted)', borderRadius: 'var(--border-radius-big)', width: '100%', marginBottom: (EntryListState.selectedEntries.value.length > index + 1) ? 'var(--space-medium)' : undefined, overflow: 'hidden' }}>
                    <div class='container-solid-muted' style={{ display: 'flex', alignItems: 'center', borderStyle: 'none none solid none', height: '2.5rem', marginBottom: 'var(--space-small)' }}>
                      <p style={{ flexShrink: 0, marginInline: 'var(--space-small)' }}>{entry.id}</p>
  
                      <div style={{ flex: 1, display: 'flex', gap: 'var(--space-tiny)', overflowX: 'auto' }}>
                        {
                          entry.classes.map((classID) => (
                            <p class='container-solid-bright' style={{ borderRadius: 'var(--border-radius-small)', fontSize: 'var(--size-tiny)', padding: 'calc(var(--space-tiny) * 0.5)' }}>{EntryListState.getClassName(classID)}</p>
                          ))
                        }
                      </div>
  
                      <button onClick={removeEntry} class='button-transparent' style={{ flexShrink: 0, border: 'var(--border-style-muted)', borderStyle: 'none none none solid', width: '2.5rem', height: '2.5rem' }}>
                        <lucid.Trash size={20} style={{ color: 'var(--color-foreground)' }}/>
                      </button>
                    </div>
  
                    <img src={`/resources/preview?partition=${entry.partition}&entry_id=${entry.id}`} style={{ width: '100%', marginTop: '-0.5rem', marginBottom: '-0.25rem' }}/>
                  </div>
                )
              })
            }
          </div>
        </div>
      </div>
    </div>
  )
}
