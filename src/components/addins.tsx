import { BUILT_IN_ADDINS, addinById } from "@/addins/registry"
import { useAddins } from "@/addins/store"
import { MenuButton } from "@/components/ribbon/ribbon-button"
import { useBackstage } from "@/document/backstage"

/** Home > Add-ins: the commands of the installed add-ins, and a way to get more. */
export function AddInsMenu({ close }: { close: () => void }) {
  const installed = useAddins((state) => state.installed)
  const notice = useAddins((state) => state.notice)
  const addins = installed.flatMap((id) => addinById(id) ?? [])
  return (
    <div className="flex w-56 flex-col py-1">
      {addins.length === 0 ? <p className="px-2 py-1 text-xs text-neutral-600">No add-ins are installed.</p> : null}
      {addins.map((addin) => (
        <div key={addin.id} role="group" aria-label={addin.name}>
          <p className="px-2 pt-1 text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{addin.name}</p>
          {addin.commands.map((command) => (
            <MenuButton
              key={command.id}
              onClick={() => {
                close()
                void command.run()
              }}
            >
              {command.label}
            </MenuButton>
          ))}
        </div>
      ))}
      {notice ? <p className="px-2 py-1 text-xs text-neutral-600">{notice}</p> : null}
      <div className="my-1 border-t border-neutral-200" />
      <MenuButton
        onClick={() => {
          close()
          useBackstage.getState().openBackstage("addins")
        }}
      >
        Get Add-ins…
      </MenuButton>
    </div>
  )
}

/** The catalogue of add-ins with Add and Remove, grouped as Word's Add-ins store is. */
export function AddInsManager() {
  const installed = useAddins((state) => state.installed)
  const install = useAddins((state) => state.install)
  const remove = useAddins((state) => state.remove)
  const notice = useAddins((state) => state.notice)
  const groups = [...new Set(BUILT_IN_ADDINS.map((addin) => addin.group))]
  return (
    <div className="addins-manager">
      {groups.map((group) => (
        <section key={group} aria-label={group}>
          <h3 className="addins-group">{group}</h3>
          {BUILT_IN_ADDINS.filter((addin) => addin.group === group).map((addin) => {
            const has = installed.includes(addin.id)
            return (
              <div key={addin.id} className="addins-row">
                <div>
                  <strong>{addin.name}</strong>
                  <p className="backstage-muted">{addin.description}</p>
                </div>
                <button
                  type="button"
                  className={`dialog-btn${has ? "" : " is-primary"}`}
                  aria-label={`${has ? "Remove" : "Add"} ${addin.name}`}
                  onClick={() => (has ? remove(addin.id) : install(addin.id))}
                >
                  {has ? "Remove" : "Add"}
                </button>
              </div>
            )
          })}
        </section>
      ))}
      {notice ? <p className="backstage-muted">{notice}</p> : null}
    </div>
  )
}
