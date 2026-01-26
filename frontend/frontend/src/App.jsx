import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000'

function formatDate(value) {
  if (!value) return '--'
  try {
    const normalized = value.includes('T') ? value : value.replace(' ', 'T')
    const date = new Date(normalized.endsWith('Z') ? normalized : `${normalized}Z`)
    return date.toLocaleString('pt-BR')
  } catch {
    return value
  }
}

function toTagEntries(tags) {
  return Object.entries(tags || {})
}

function TagEditor({ tags, onChange, lockedKeys }) {
  const entries = toTagEntries(tags)

  const updateKey = (oldKey, newKey) => {
    if (lockedKeys.has(oldKey)) return
    if (!newKey) return
    const next = { ...tags }
    const value = next[oldKey]
    delete next[oldKey]
    next[newKey] = value
    onChange(next)
  }

  const updateValue = (key, value) => {
    const next = { ...tags, [key]: value }
    onChange(next)
  }

  const removeKey = (key) => {
    if (lockedKeys.has(key)) return
    const next = { ...tags }
    delete next[key]
    onChange(next)
  }

  const [newKey, setNewKey] = useState('')
  const [newValue, setNewValue] = useState('')

  const addTag = () => {
    if (!newKey) return
    const next = { ...tags, [newKey]: newValue }
    onChange(next)
    setNewKey('')
    setNewValue('')
  }

  return (
    <div className="tag-editor">
      {entries.length === 0 && <p className="muted">Sem tags adicionais.</p>}
      {entries.map(([key, value]) => (
        <div className="tag-row" key={key}>
          <input
            className="tag-key"
            value={key}
            disabled={lockedKeys.has(key)}
            onChange={(event) => updateKey(key, event.target.value)}
          />
          <input
            className="tag-value"
            value={value}
            onChange={(event) => updateValue(key, event.target.value)}
            disabled={lockedKeys.has(key)}
          />
          <button
            className="ghost"
            type="button"
            onClick={() => removeKey(key)}
            disabled={lockedKeys.has(key)}
          >
            Remover
          </button>
        </div>
      ))}
      <div className="tag-row tag-add">
        <input
          className="tag-key"
          placeholder="chave"
          value={newKey}
          onChange={(event) => setNewKey(event.target.value)}
        />
        <input
          className="tag-value"
          placeholder="valor"
          value={newValue}
          onChange={(event) => setNewValue(event.target.value)}
        />
        <button className="ghost" type="button" onClick={addTag}>
          Adicionar
        </button>
      </div>
    </div>
  )
}

function TargetCard({ target, onAdd, onRemove, onShowProperties, onUpdateTags, showAdd }) {
  const locked = useMemo(() => new Set(), [])

  return (
    <div className="card target-card">
      <div className="target-main">
        <div>
          <h4>{target.name}</h4>
          <p className="muted">{target.typeName}</p>
        </div>
        <div className="target-actions">
          {onShowProperties && (
            <button className="ghost" type="button" onClick={() => onShowProperties(target)}>
              Propriedades
            </button>
          )}
          {onRemove && (
            <button className="ghost" type="button" onClick={() => onRemove(target)}>
              Remover
            </button>
          )}
          {showAdd && (
            <button className="primary" type="button" onClick={() => onAdd(target)}>
              Adicionar
            </button>
          )}
        </div>
      </div>
      <div className="target-meta">
        <span>ID: {target.id}</span>
        {target.dg_role && <span>DG: {target.dg_role}</span>}
        {target.machine_name && <span>Host: {target.machine_name}</span>}
        {target.listener_name && <span>Listener: {target.listener_name}</span>}
      </div>
      <TagEditor tags={target.tags || {}} onChange={onUpdateTags} lockedKeys={locked} />
    </div>
  )
}

export default function App() {
  const [page, setPage] = useState('targets')
  const [managers, setManagers] = useState([])
  const [endpointName, setEndpointName] = useState('')
  const [cacheInfo, setCacheInfo] = useState({ count: 0, lastRefresh: null })
  const [configTargets, setConfigTargets] = useState([])
  const [configDirty, setConfigDirty] = useState(false)
  const [expandedTargets, setExpandedTargets] = useState({})
  const [baselineTargets, setBaselineTargets] = useState([])
  const [notice, setNotice] = useState(null)
  const noticeTimer = useRef(null)
  const [propertiesModal, setPropertiesModal] = useState({
    open: false,
    target: null,
    loading: false,
    error: null,
    data: null,
  })

  const showNotice = (text, kind = 'warning') => {
    if (noticeTimer.current) {
      clearTimeout(noticeTimer.current)
    }
    setNotice({ text, kind })
    noticeTimer.current = setTimeout(() => {
      setNotice(null)
      noticeTimer.current = null
    }, 2500)
  }

  const openProperties = async (target) => {
    if (!endpointName || !target) return
    setPropertiesModal({
      open: true,
      target,
      loading: true,
      error: null,
      data: null,
    })
    try {
      const data = await fetchJson(
        `/api/targets/properties?endpointName=${encodeURIComponent(endpointName)}&targetId=${encodeURIComponent(
          target.id
        )}`
      )
      setPropertiesModal({
        open: true,
        target,
        loading: false,
        error: null,
        data,
      })
    } catch (error) {
      console.error(error)
      setPropertiesModal({
        open: true,
        target,
        loading: false,
        error: 'Erro ao carregar propriedades',
        data: null,
      })
    }
  }

  const closeProperties = () => {
    setPropertiesModal({
      open: false,
      target: null,
      loading: false,
      error: null,
      data: null,
    })
  }

  const [searchQuery, setSearchQuery] = useState('')
  const [searchSuggestions, setSearchSuggestions] = useState([])
  const [selectedTargets, setSelectedTargets] = useState([])
  const [bulkTag, setBulkTag] = useState({ key: '', value: '' })

  const [systemQuery, setSystemQuery] = useState('')
  const [systemSuggestions, setSystemSuggestions] = useState([])

  const [loading, setLoading] = useState({
    refresh: false,
    search: false,
    system: false,
    save: false,
  })

  const { newTargetIds, modifiedTargetIds, newTargets, existingTargets } = useMemo(() => {
    const baselineMap = new Map()
    baselineTargets.forEach((target) => {
      baselineMap.set(target.id, JSON.stringify(normalizeTarget(target)))
    })

    const newIds = new Set()
    const modifiedIds = new Set()
    const currentTargets = []
    const freshTargets = []

    configTargets.forEach((target) => {
      const normalized = JSON.stringify(normalizeTarget(target))
      const baseline = baselineMap.get(target.id)
      if (!baseline) {
        newIds.add(target.id)
        freshTargets.push(target)
      } else if (baseline !== normalized) {
        modifiedIds.add(target.id)
        currentTargets.push(target)
      } else {
        currentTargets.push(target)
      }
    })

    return {
      newTargetIds: newIds,
      modifiedTargetIds: modifiedIds,
      newTargets: freshTargets,
      existingTargets: currentTargets,
    }
  }, [baselineTargets, configTargets])

  const groupedConfigTargets = useMemo(() => {
    const groups = new Map()
    existingTargets.forEach((target) => {
      const key = target.typeName || 'unknown'
      if (!groups.has(key)) {
        groups.set(key, [])
      }
      groups.get(key).push(target)
    })
    return Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, items]) => [
        key,
        items.slice().sort((left, right) => (left.name || '').localeCompare(right.name || '')),
      ])
  }, [existingTargets])

  const groupedSelectedTargets = useMemo(() => {
    const groups = new Map()
    selectedTargets.forEach((target) => {
      const key = target.typeName || 'unknown'
      if (!groups.has(key)) {
        groups.set(key, [])
      }
      groups.get(key).push(target)
    })
    return Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, items]) => [
        key,
        items.slice().sort((left, right) => (left.name || '').localeCompare(right.name || '')),
      ])
  }, [selectedTargets])

  function normalizeTarget(target) {
    const tags = target.tags || {}
    const sortedTags = Object.keys(tags)
      .sort()
      .reduce((acc, key) => {
        acc[key] = tags[key]
        return acc
      }, {})
    return {
      id: target.id,
      name: target.name,
      typeName: target.typeName,
      tags: sortedTags,
      dg_role: target.dg_role || null,
      listener_name: target.listener_name || null,
      machine_name: target.machine_name || null,
    }
  }

  const fetchJson = async (path, options = {}) => {
    const response = await fetch(`${API_BASE}${path}`, options)
    if (!response.ok) {
      const message = await response.text()
      throw new Error(message || 'Erro na API')
    }
    return response.json()
  }

  const loadManagers = async () => {
    const data = await fetchJson('/api/enterprise-managers')
    setManagers(data)
    if (data.length && !endpointName) {
      setEndpointName(data[0].name)
    }
  }

  const loadConfig = async (name) => {
    if (!name) return
    const site = await fetchJson(`/api/config/targets?endpointName=${encodeURIComponent(name)}`)
    setConfigTargets(site.targets || [])
    setBaselineTargets((site.targets || []).map((item) => ({ ...item, tags: { ...(item.tags || {}) } })))
    setConfigDirty(false)
  }

  const loadCacheInfo = async (name) => {
    if (!name) return
    const info = await fetchJson(`/api/targets/cache-info?endpointName=${encodeURIComponent(name)}`)
    setCacheInfo(info)
  }

  useEffect(() => {
    loadManagers().catch((error) => console.error(error))
  }, [])

  useEffect(() => {
    if (!endpointName) return
    loadConfig(endpointName).catch((error) => console.error(error))
    loadCacheInfo(endpointName).catch((error) => console.error(error))
  }, [endpointName])

  useEffect(() => {
    if (!endpointName || searchQuery.trim().length < 2) {
      setSearchSuggestions([])
      return
    }
    const handler = setTimeout(async () => {
      setLoading((prev) => ({ ...prev, search: true }))
      try {
        const results = await fetchJson(
          `/api/targets/search?endpointName=${encodeURIComponent(endpointName)}&q=${encodeURIComponent(
            searchQuery
          )}&limit=50`
        )
        setSearchSuggestions(results)
      } catch (error) {
        console.error(error)
      } finally {
        setLoading((prev) => ({ ...prev, search: false }))
      }
    }, 400)

    return () => clearTimeout(handler)
  }, [searchQuery, endpointName])

  useEffect(() => {
    if (!endpointName || systemQuery.trim().length < 2) {
      setSystemSuggestions([])
      return
    }
    const handler = setTimeout(async () => {
      try {
        const results = await fetchJson(
          `/api/targets/search?endpointName=${encodeURIComponent(
            endpointName
          )}&q=${encodeURIComponent(systemQuery)}&types=rac_database,oracle_pdb&limit=20`
        )
        setSystemSuggestions(results)
      } catch (error) {
        console.error(error)
      }
    }, 350)

    return () => clearTimeout(handler)
  }, [systemQuery, endpointName])

  const refreshTargets = async () => {
    if (!endpointName) return
    setLoading((prev) => ({ ...prev, refresh: true }))
    try {
      await fetchJson(`/api/targets/refresh?endpointName=${encodeURIComponent(endpointName)}`, {
        method: 'POST',
      })
      await loadCacheInfo(endpointName)
    } catch (error) {
      console.error(error)
      alert('Erro ao atualizar targets')
    } finally {
      setLoading((prev) => ({ ...prev, refresh: false }))
    }
  }

  const applyBulkTag = () => {
    if (!bulkTag.key) return
    setSelectedTargets((prev) =>
      prev.map((item) => ({
        ...item,
        tags: { ...(item.tags || {}), [bulkTag.key]: bulkTag.value },
      }))
    )
  }

  const updateResultTags = (listSetter, targetId, tags) => {
    listSetter((prev) => prev.map((item) => (item.id === targetId ? { ...item, tags } : item)))
  }

  const addSelectedTarget = (target) => {
    if (selectedTargets.some((item) => item.id === target.id)) {
      showNotice('target ja selecionado')
      return
    }
    setSelectedTargets((prev) => [...prev, { ...target, tags: target.tags || {} }])
  }

  const removeSelectedTarget = (target) => {
    setSelectedTargets((prev) => prev.filter((item) => item.id !== target.id))
  }

  const addTargetsToConfig = async (items, options = {}) => {
    if (!endpointName || items.length === 0) return
    const existingIds = new Set(configTargets.map((item) => item.id))
    const newItems = items.filter((item) => !existingIds.has(item.id))
    const duplicateCount = items.length - newItems.length
    if (duplicateCount > 0) {
      showNotice('target ja esta na configuracao')
    }
    if (newItems.length === 0) return
    try {
      const payload = {
        endpointName,
        targets: newItems.map((item) => ({
          id: item.id,
          name: item.name,
          typeName: item.typeName,
          tags: item.tags || {},
        })),
      }
      const data = await fetchJson('/api/targets/prepare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const prepared = data.targets || []
      setConfigTargets((prev) => {
        const existing = new Map(prev.map((item) => [item.id, item]))
        prepared.forEach((item) => {
          existing.set(item.id, item)
        })
        return Array.from(existing.values())
      })
      setConfigDirty(true)
      if (options.removeIds) {
        const removeSet = new Set(options.removeIds.filter((id) => newItems.some((item) => item.id === id)))
        if (removeSet.size > 0) {
          setSelectedTargets((prev) => prev.filter((item) => !removeSet.has(item.id)))
        }
      }
    } catch (error) {
      console.error(error)
      alert('Erro ao adicionar targets')
    }
  }

  const addSystemTargets = async (root) => {
    if (!endpointName || !root) return
    setLoading((prev) => ({ ...prev, system: true }))
    try {
      const data = await fetchJson('/api/targets/auto-map', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpointName,
          rootName: root.name,
          rootType: root.typeName,
        }),
      })
      const mapped = (data.targets || []).map((item) => ({ ...item }))
      const existingIds = new Set(selectedTargets.map((item) => item.id))
      const hasDuplicate = mapped.some((item) => existingIds.has(item.id))
      setSelectedTargets((prev) => {
        const existing = new Map(prev.map((item) => [item.id, item]))
        mapped.forEach((item) => {
          existing.set(item.id, item)
        })
        return Array.from(existing.values())
      })
      if (hasDuplicate) {
        showNotice('target ja selecionado')
      }
    } catch (error) {
      console.error(error)
      alert('Erro ao gerar sistema')
    } finally {
      setLoading((prev) => ({ ...prev, system: false }))
    }
  }

  const saveConfig = async () => {
    if (!endpointName) return
    setLoading((prev) => ({ ...prev, save: true }))
    try {
      await fetchJson('/api/config/targets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ endpointName, targets: configTargets }),
      })
      setConfigDirty(false)
      setBaselineTargets(configTargets.map((item) => ({ ...item, tags: { ...(item.tags || {}) } })))
    } catch (error) {
      console.error(error)
      alert('Erro ao salvar configuracao')
    } finally {
      setLoading((prev) => ({ ...prev, save: false }))
    }
  }

  const removeFromConfig = (targetId) => {
    setConfigTargets((prev) => prev.filter((item) => item.id !== targetId))
    setConfigDirty(true)
  }

  const renderConfigCard = (target) => {
    const isExpanded = !!expandedTargets[target.id]
    const isNew = newTargetIds.has(target.id)
    const isModified = !isNew && modifiedTargetIds.has(target.id)
    const classes = ['card', 'target-card']
    if (!isExpanded) classes.push('collapsed')
    if (isNew) classes.push('new-target')
    if (isModified) classes.push('modified-target')

    return (
      <div className={classes.join(' ')} key={target.id}>
        <button
          type="button"
          className="collapse-toggle"
          onClick={() =>
            setExpandedTargets((prev) => ({
              ...prev,
              [target.id]: !prev[target.id],
            }))
          }
        >
          <span className="target-name">{target.name}</span>
        </button>

        {isExpanded && (
          <>
            <div className="target-meta">
              <span>ID: {target.id}</span>
              {target.dg_role && <span>DG: {target.dg_role}</span>}
              {target.machine_name && <span>Host: {target.machine_name}</span>}
              {target.listener_name && <span>Listener: {target.listener_name}</span>}
            </div>
            <div className="target-actions">
              <button className="ghost" type="button" onClick={() => openProperties(target)}>
                Propriedades
              </button>
              <button className="ghost" type="button" onClick={() => removeFromConfig(target.id)}>
                Remover
              </button>
            </div>
            <TagEditor
              tags={target.tags || {}}
              lockedKeys={new Set()}
              onChange={(tags) => {
                setConfigTargets((prev) =>
                  prev.map((item) => (item.id === target.id ? { ...item, tags } : item))
                )
                setConfigDirty(true)
              }}
            />
          </>
        )}
      </div>
    )
  }

  return (
    <div className="app">
      <header className="app-header">
        <div>
          <p className="eyebrow">oem_ingest_frontend</p>
          <h1>Configuracao inteligente de targets</h1>
          <p className="muted">
            Construa rapidamente arquivos YAML confiaveis para o OEM Ingest.
          </p>
        </div>
        <nav className="nav">
          <button
            className={page === 'targets' ? 'nav-button active' : 'nav-button'}
            type="button"
            onClick={() => setPage('targets')}
          >
            Targets
          </button>
          <button
            className={page === 'metrics' ? 'nav-button active' : 'nav-button'}
            type="button"
            onClick={() => setPage('metrics')}
          >
            Metricas
          </button>
        </nav>
      </header>

      {page === 'targets' && (
        <section className="page">
          <div className="toolbar">
            <div className="field">
              <label>Endpoint OEM</label>
              <select value={endpointName} onChange={(event) => setEndpointName(event.target.value)}>
                {managers.map((item) => (
                  <option key={item.name} value={item.name}>
                    {item.name} | {item.endpoint}
                  </option>
                ))}
              </select>
            </div>
            <div className="status">
              <p>
                Cache: <strong>{cacheInfo.count}</strong> targets | Ultima atualizacao:{' '}
                <strong>{formatDate(cacheInfo.lastRefresh)}</strong>
              </p>
              <button className="ghost" type="button" onClick={refreshTargets} disabled={loading.refresh}>
                {loading.refresh ? 'Atualizando...' : 'Recarregar targets'}
              </button>
            </div>
          </div>

          <div className="grid">
            <div className="panel">
              <div className="panel-header">
                <div>
                  <h2>Pesquisa e selecao</h2>
                  <p className="muted">
                    Pesquise targets, aplique tags e envie para a configuracao oficial.
                  </p>
                </div>
              </div>
              <div className="search-block">
                <h3>Pesquisa livre</h3>
                <p className="muted">
                  Digite pelo menos 2 caracteres para buscar qualquer tipo de target.
                </p>
                <input
                  className="search-input"
                  placeholder="Ex: cdbp51bc"
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                />
                {loading.search && <p className="muted">Buscando targets...</p>}
                {searchSuggestions.length > 0 && (
                  <div className="suggestions">
                    {searchSuggestions.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className="suggestion-item"
                        onClick={() => {
                          addSelectedTarget(item)
                          setSearchQuery('')
                          setSearchSuggestions([])
                        }}
                      >
                        {item.name} | {item.typeName}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="search-block">
                <h3>Pesquisa de sistema (RAC/PDB)</h3>
                <p className="muted">
                  Escolha um rac_database ou oracle_pdb para mapear todo o sistema.
                </p>
                <input
                  className="search-input"
                  placeholder="Ex: cdbp51bc ou cdbp51bc_CDBP51BCPDB001"
                  value={systemQuery}
                  onChange={(event) => setSystemQuery(event.target.value)}
                />
                {systemSuggestions.length > 0 && (
                  <div className="suggestions">
                    {systemSuggestions.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className="suggestion-item"
                        onClick={() => {
                          setSystemQuery(item.name)
                          setSystemSuggestions([])
                          addSystemTargets(item)
                        }}
                      >
                        {item.name} | {item.typeName}
                      </button>
                    ))}
                  </div>
                )}
                {loading.system && <p className="muted">Montando sistema...</p>}
              </div>

              <div className="search-block selected-block">
                <h3>Targets selecionados</h3>
                {notice && <div className={`notice ${notice.kind}`}>{notice.text}</div>}
                {selectedTargets.length === 0 && (
                  <p className="muted">Nenhum target selecionado para edicao.</p>
                )}
                {selectedTargets.length > 0 && (
                  <div className="bulk-tag">
                    <input
                      placeholder="Tag (chave)"
                      value={bulkTag.key}
                      onChange={(event) => setBulkTag((prev) => ({ ...prev, key: event.target.value }))}
                    />
                    <input
                      placeholder="Valor"
                      value={bulkTag.value}
                      onChange={(event) => setBulkTag((prev) => ({ ...prev, value: event.target.value }))}
                    />
                    <button className="ghost" type="button" onClick={applyBulkTag}>
                      Aplicar em todos
                    </button>
                    <button
                      className="primary"
                      type="button"
                      onClick={() =>
                        addTargetsToConfig(selectedTargets, {
                          removeIds: selectedTargets.map((item) => item.id),
                        })
                      }
                    >
                      Adicionar todos
                    </button>
                    <button className="ghost" type="button" onClick={() => setSelectedTargets([])}>
                      Remover todos
                    </button>
                  </div>
                )}
                <div className="card-list">
                  {groupedSelectedTargets.map(([typeName, items]) => (
                    <div key={typeName} className="type-section">
                      <h3 className="type-title">{typeName}</h3>
                      <div className="type-list">
                        {items.map((target) => (
                          <TargetCard
                            key={target.id}
                            target={target}
                            showAdd
                            onShowProperties={openProperties}
                            onAdd={(item) => addTargetsToConfig([item], { removeIds: [item.id] })}
                            onRemove={removeSelectedTarget}
                            onUpdateTags={(tags) => updateResultTags(setSelectedTargets, target.id, tags)}
                          />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="panel">
              <div className="panel-header">
                <div>
                  <h2>Configuracao atual</h2>
                  <p className="muted">Edite tags, remova targets e salve o YAML.</p>
                </div>
                <div className="panel-actions">
                  <button className="ghost" type="button" onClick={() => loadConfig(endpointName)}>
                    Recarregar YAML
                  </button>
                  <button className="primary" type="button" onClick={saveConfig} disabled={loading.save}>
                    {loading.save ? 'Salvando...' : 'Salvar configuracao'}
                  </button>
                </div>
              </div>
              {configDirty && <p className="warning">Voce possui alteracoes nao salvas.</p>}

              {configTargets.length === 0 && (
                <p className="muted">Nenhum target configurado para este endpoint.</p>
              )}

              <div className="card-list">
                {newTargets.length > 0 && (
                  <div className="type-section">
                    <h3 className="type-title">new</h3>
                    <div className="type-list">
                      {newTargets.map((target) => renderConfigCard(target))}
                    </div>
                  </div>
                )}
                {groupedConfigTargets.map(([typeName, items]) => (
                  <div key={typeName} className="type-section">
                    <h3 className="type-title">{typeName}</h3>
                    <div className="type-list">
                      {items.map((target) => renderConfigCard(target))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      {page === 'metrics' && (
        <section className="page">
          <div className="panel placeholder">
            <h2>Metricas</h2>
            <p className="muted">
              Esta pagina sera construida em breve. Estrutura pronta para receber os endpoints de metricas.
            </p>
          </div>
        </section>
      )}

      {propertiesModal.open && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal">
            <div className="modal-header">
              <div>
                <h3>Propriedades</h3>
                {propertiesModal.target && (
                  <p className="muted">
                    {propertiesModal.target.name} | {propertiesModal.target.typeName}
                  </p>
                )}
              </div>
              <button className="ghost" type="button" onClick={closeProperties}>
                Fechar
              </button>
            </div>
            <div className="modal-body">
              {propertiesModal.loading && <p className="muted">Carregando...</p>}
              {propertiesModal.error && <p className="warning">{propertiesModal.error}</p>}
              {!propertiesModal.loading && !propertiesModal.error && (
                <div className="properties-table">
                  {(propertiesModal.data?.items || []).map((item) => (
                    <div className="properties-row" key={item.id || item.name}>
                      <div className="properties-key">
                        <strong>{item.displayName || item.name || item.id}</strong>
                        <span className="muted">{item.id || item.name}</span>
                      </div>
                      <div className="properties-value">{String(item.value ?? '')}</div>
                    </div>
                  ))}
                  {(propertiesModal.data?.items || []).length === 0 && (
                    <p className="muted">Nenhuma propriedade retornada.</p>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
