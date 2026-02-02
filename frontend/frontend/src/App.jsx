import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'

const API_BASE = import.meta.env.VITE_API_BASE || ''
const NORMALIZED_API_BASE = (API_BASE.replace(/\/+$/, '') || '.')

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

function yamlScalar(value) {
  if (value === null || value === undefined) return 'null'
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  const text = String(value)
  return `'${text.replace(/'/g, "''")}'`
}

function toYaml(value, indent = 0) {
  const pad = '  '.repeat(indent)
  if (Array.isArray(value)) {
    if (value.length === 0) return `${pad}[]`
    return value
      .map((item) => {
        if (item === null || item === undefined) return `${pad}- null`
        if (Array.isArray(item)) {
          return `${pad}-\n${toYaml(item, indent + 1)}`
        }
        if (item && typeof item === 'object') {
          const firstIndent = `${pad}- `
          const restIndent = `${pad}  `
          return Object.entries(item)
            .filter(([, itemValue]) => itemValue !== undefined)
            .map(([key, itemValue], idx) => {
              if (Array.isArray(itemValue) || (itemValue && typeof itemValue === 'object')) {
                const prefix = idx === 0 ? firstIndent : restIndent
                return `${prefix}${key}:\n${toYaml(itemValue, indent + 2)}`
              }
              const prefix = idx === 0 ? firstIndent : restIndent
              return `${prefix}${key}: ${yamlScalar(itemValue)}`
            })
            .join('\n')
        }
        return `${pad}- ${yamlScalar(item)}`
      })
      .join('\n')
  }
  if (value && typeof value === 'object') {
    return Object.entries(value)
      .filter(([, itemValue]) => itemValue !== undefined)
      .map(([key, itemValue]) => {
        if (Array.isArray(itemValue) || (itemValue && typeof itemValue === 'object')) {
          return `${pad}${key}:\n${toYaml(itemValue, indent + 1)}`
        }
        return `${pad}${key}: ${yamlScalar(itemValue)}`
      })
      .join('\n')
  }
  return `${pad}${yamlScalar(value)}`
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

  const showMetricsNotice = (text, kind = 'warning') => {
    if (metricsNoticeTimer.current) {
      clearTimeout(metricsNoticeTimer.current)
    }
    setMetricsNotice({ text, kind })
    metricsNoticeTimer.current = setTimeout(() => {
      setMetricsNotice(null)
      metricsNoticeTimer.current = null
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

  const [metricsConfig, setMetricsConfig] = useState({})
  const [metricsDirty, setMetricsDirty] = useState(false)
  const [baselineMetricsConfig, setBaselineMetricsConfig] = useState({})
  const [metricsNotice, setMetricsNotice] = useState(null)
  const metricsNoticeTimer = useRef(null)
  const [metricTypes, setMetricTypes] = useState([])
  const [metricTargetType, setMetricTargetType] = useState('')
  const [metricTargetQuery, setMetricTargetQuery] = useState('')
  const [metricTargetAll, setMetricTargetAll] = useState(false)
  const [metricTargetFocused, setMetricTargetFocused] = useState(false)
  const [metricTargetSuggestions, setMetricTargetSuggestions] = useState([])
  const [metricTargetSelected, setMetricTargetSelected] = useState(null)
  const [metricGroups, setMetricGroups] = useState([])
  const [expandedMetricGroups, setExpandedMetricGroups] = useState({})
  const [metricSelected, setMetricSelected] = useState(null)
  const [metricLatestData, setMetricLatestData] = useState(null)
  const [metricLatestError, setMetricLatestError] = useState(null)
  const [metricAvailability, setMetricAvailability] = useState([])
  const [metricGroupKeys, setMetricGroupKeys] = useState(null)
  const [metricGroupKeysError, setMetricGroupKeysError] = useState(null)
  const [metricGroupHighlighted, setMetricGroupHighlighted] = useState(null)
  const [jsonModal, setJsonModal] = useState({ open: false, data: null })
  const [metricsCollapsed, setMetricsCollapsed] = useState({
    availability: false,
    data: false,
  })
  const [metricsLoading, setMetricsLoading] = useState({
    config: false,
    groups: false,
    data: false,
    availability: false,
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

  const { newMetricKeys, modifiedMetricKeys, newMetricItems, existingMetricItems } = useMemo(() => {
    const baselineMap = new Map()
    Object.entries(baselineMetricsConfig || {}).forEach(([typeName, items]) => {
      ;(items || []).forEach((item) => {
        const key = `${typeName}::${item.metric_group_name}`
        baselineMap.set(
          key,
          JSON.stringify({ metric_group_name: item.metric_group_name, freq: Number(item.freq) || 0 })
        )
      })
    })

    const newKeys = new Set()
    const modifiedKeys = new Set()
    const newItems = []
    const currentItems = []

    Object.entries(metricsConfig || {}).forEach(([typeName, items]) => {
      ;(items || []).forEach((item, index) => {
        const key = `${typeName}::${item.metric_group_name}`
        const normalized = JSON.stringify({
          metric_group_name: item.metric_group_name,
          freq: Number(item.freq) || 0,
        })
        const baseline = baselineMap.get(key)
        const entry = { ...item, _typeName: typeName, _index: index, _key: key }
        if (!baseline) {
          newKeys.add(key)
          newItems.push(entry)
        } else if (baseline !== normalized) {
          modifiedKeys.add(key)
          currentItems.push(entry)
        } else {
          currentItems.push(entry)
        }
      })
    })

    newItems.sort((left, right) => {
      const typeCompare = left._typeName.localeCompare(right._typeName)
      if (typeCompare !== 0) return typeCompare
      return (left.metric_group_name || '').localeCompare(right.metric_group_name || '')
    })

    return {
      newMetricKeys: newKeys,
      modifiedMetricKeys: modifiedKeys,
      newMetricItems: newItems,
      existingMetricItems: currentItems,
    }
  }, [baselineMetricsConfig, metricsConfig])

  const groupedMetricsConfig = useMemo(() => {
    const groups = new Map()
    existingMetricItems.forEach((item) => {
      const key = item._typeName || 'unknown'
      if (!groups.has(key)) {
        groups.set(key, [])
      }
      groups.get(key).push(item)
    })
    return Array.from(groups.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, items]) => [
        key,
        items.slice().sort((left, right) => (left.metric_group_name || '').localeCompare(right.metric_group_name || '')),
      ])
  }, [existingMetricItems])

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
    const response = await fetch(`${NORMALIZED_API_BASE}${path}`, options)
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

  const downloadYaml = (filename, data) => {
    const yamlText = `${toYaml(data)}\n`
    const blob = new Blob([yamlText], { type: 'text/yaml' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    link.remove()
    URL.revokeObjectURL(url)
  }

  const downloadTargetsYaml = () => {
    if (!endpointName) return
    const manager = managers.find((item) => item.name === endpointName) || {}
    const targets = configTargets.map((target) => {
      const item = {
        id: target.id,
        name: target.name,
        typeName: target.typeName,
        tags: { ...(target.tags || {}) },
      }
      if (target.dg_role) item.dg_role = target.dg_role
      if (target.listener_name) item.listener_name = target.listener_name
      if (target.machine_name) item.machine_name = target.machine_name
      return item
    })
    const data = [
      {
        site: manager.site ?? null,
        endpoint: manager.endpoint ?? null,
        name: endpointName,
        targets,
      },
    ]
    downloadYaml('targets.yaml', data)
  }

  const downloadMetricsYaml = () => {
    downloadYaml('metrics.yaml', metricsConfig)
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

  const loadMetricsConfig = async () => {
    setMetricsLoading((prev) => ({ ...prev, config: true }))
    try {
      const data = await fetchJson('/api/config/metrics')
      setMetricsConfig(data || {})
      setBaselineMetricsConfig(JSON.parse(JSON.stringify(data || {})))
      setMetricsDirty(false)
    } catch (error) {
      console.error(error)
    } finally {
      setMetricsLoading((prev) => ({ ...prev, config: false }))
    }
  }

  const saveMetricsConfig = async () => {
    setMetricsLoading((prev) => ({ ...prev, config: true }))
    try {
      await fetchJson('/api/config/metrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ metrics: metricsConfig }),
      })
      setBaselineMetricsConfig(JSON.parse(JSON.stringify(metricsConfig)))
      setMetricsDirty(false)
    } catch (error) {
      console.error(error)
      alert('Erro ao salvar metricas')
    } finally {
      setMetricsLoading((prev) => ({ ...prev, config: false }))
    }
  }

  const loadMetricTypes = async (name) => {
    if (!name) return
    try {
      const data = await fetchJson(`/api/targets/types?endpointName=${encodeURIComponent(name)}`)
      const types = data || []
      setMetricTypes(types)
      if (!metricTargetType && types.length > 0) {
        setMetricTargetType(types[0])
      }
    } catch (error) {
      console.error(error)
      const fallback = Array.from(new Set(configTargets.map((item) => item.typeName).filter(Boolean)))
      setMetricTypes(fallback)
      if (!metricTargetType && fallback.length > 0) {
        setMetricTargetType(fallback[0])
      }
    }
  }

  const addMetricGroupToConfig = (targetType, groupName) => {
    if (!targetType || !groupName) return
    const existing = metricsConfig[targetType] || []
    if (existing.some((item) => item.metric_group_name === groupName)) {
      showMetricsNotice('Metrica ja configurada')
      return
    }
    const next = {
      ...metricsConfig,
      [targetType]: [...existing, { metric_group_name: groupName, freq: 5 }],
    }
    setMetricsConfig(next)
    setMetricsDirty(true)
  }

  const updateMetricFreq = (targetType, index, value) => {
    const freqValue = Number(value)
    if (Number.isNaN(freqValue)) return
    const list = metricsConfig[targetType] || []
    const nextList = list.map((item, idx) =>
      idx === index ? { ...item, freq: freqValue } : item
    )
    setMetricsConfig({ ...metricsConfig, [targetType]: nextList })
    setMetricsDirty(true)
  }

  const removeMetricGroup = (targetType, index) => {
    const list = metricsConfig[targetType] || []
    const nextList = list.filter((_, idx) => idx !== index)
    const nextConfig = { ...metricsConfig, [targetType]: nextList }
    setMetricsConfig(nextConfig)
    setMetricsDirty(true)
  }

  const fetchMetricGroups = async (target) => {
    if (!endpointName || !target) return
    setMetricsLoading((prev) => ({ ...prev, groups: true }))
    try {
      const data = await fetchJson(
        `/api/metrics/metric-groups?endpointName=${encodeURIComponent(endpointName)}&targetId=${encodeURIComponent(
          target.id
        )}`
      )
      setMetricGroups(data.items || [])
      setExpandedMetricGroups({})
      setMetricGroupHighlighted(null)
      setMetricGroupKeys(null)
      setMetricGroupKeysError(null)
    } catch (error) {
      console.error(error)
      setMetricGroups([])
      setMetricGroupHighlighted(null)
      setMetricGroupKeys(null)
      setMetricGroupKeysError(null)
    } finally {
      setMetricsLoading((prev) => ({ ...prev, groups: false }))
    }
  }

  const fetchMetricGroupKeys = async (targetId, groupName) => {
    if (!endpointName || !targetId || !groupName) return
    setMetricGroupKeys(null)
    setMetricGroupKeysError(null)
    try {
      const data = await fetchJson(
        `/api/metrics/metric-group?endpointName=${encodeURIComponent(
          endpointName
        )}&targetId=${encodeURIComponent(targetId)}&metricGroupName=${encodeURIComponent(groupName)}`
      )
      setMetricGroupKeys(data.keys || [])
    } catch (error) {
      console.error(error)
      let message = 'Erro ao carregar keys'
      if (error?.message) {
        try {
          const parsed = JSON.parse(error.message)
          message = parsed.detail || error.message
        } catch {
          message = error.message
        }
      }
      setMetricGroupKeys([])
      setMetricGroupKeysError(message)
    }
  }

  const fetchLatestMetricData = async (target, groupName, targetType, options = {}) => {
    const { expandAvailability = false, clearAvailability = false } = options
    if (!endpointName || !target || !groupName) return
    setMetricsCollapsed((prev) => ({
      ...prev,
      data: false,
      availability: expandAvailability ? false : prev.availability,
    }))
    fetchMetricGroupKeys(target.id, groupName)
    if (clearAvailability) {
      setMetricAvailability([])
    }
    setMetricsLoading((prev) => ({ ...prev, data: true }))
    try {
      const data = await fetchJson(
        `/api/metrics/latest-data?endpointName=${encodeURIComponent(endpointName)}&targetId=${encodeURIComponent(
          target.id
        )}&metricGroupName=${encodeURIComponent(groupName)}`
      )
      setMetricLatestData(data)
      setMetricLatestError(null)
      setMetricSelected({
        targetId: target.id,
        targetName: target.name,
        targetType,
        metricGroupName: groupName,
      })
    } catch (error) {
      console.error(error)
      setMetricLatestData(null)
      let message = 'Erro ao buscar dados'
      if (error?.message) {
        try {
          const parsed = JSON.parse(error.message)
          message = parsed.detail || error.message
        } catch {
          message = error.message
        }
      }
      if (message.toLowerCase().includes('404') || message.toLowerCase().includes('not found')) {
        message = 'Metrica indisponivel para este target (404).'
      }
      setMetricLatestError(message)
      setMetricSelected({
        targetId: target.id,
        targetName: target.name,
        targetType,
        metricGroupName: groupName,
      })
    } finally {
      setMetricsLoading((prev) => ({ ...prev, data: false }))
    }
  }

  const fetchMetricAvailability = async () => {
    if (!endpointName || !metricSelected?.metricGroupName || !metricSelected?.targetType) return
    setMetricsLoading((prev) => ({ ...prev, availability: true }))
    try {
      const data = await fetchJson('/api/metrics/availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpointName,
          metricGroupName: metricSelected.metricGroupName,
          targetType: metricSelected.targetType,
        }),
      })
      setMetricAvailability(data.items || [])
    } catch (error) {
      console.error(error)
      setMetricAvailability([])
    } finally {
      setMetricsLoading((prev) => ({ ...prev, availability: false }))
    }
  }

  const selectMetricFromConfig = (targetType, groupName) => {
    setMetricsCollapsed((prev) => ({ ...prev, availability: false }))
    setMetricSelected({
      targetId: metricSelected?.targetId || null,
      targetName: metricSelected?.targetName || '',
      targetType,
      metricGroupName: groupName,
    })
    setMetricAvailability([])
    setMetricLatestData(null)
    setMetricLatestError(null)
    setMetricGroupKeys(null)
    setMetricGroupKeysError(null)
  }

  const openJsonModal = (data) => {
    if (!data) return
    setJsonModal({ open: true, data })
  }

  const closeJsonModal = () => {
    setJsonModal({ open: false, data: null })
  }

  useEffect(() => {
    loadManagers().catch((error) => console.error(error))
    loadMetricsConfig().catch((error) => console.error(error))
  }, [])

  useEffect(() => {
    if (!endpointName) return
    loadConfig(endpointName).catch((error) => console.error(error))
    loadCacheInfo(endpointName).catch((error) => console.error(error))
  }, [endpointName])

  useEffect(() => {
    if (page !== 'metrics' || !endpointName) return
    loadMetricTypes(endpointName).catch((error) => console.error(error))
  }, [page, endpointName, configTargets])

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

  useEffect(() => {
    if (!metricTargetType) {
      setMetricTargetSuggestions([])
      return
    }

    const trimmed = metricTargetQuery.trim()
    const showDefaults = metricTargetFocused && trimmed.length === 0
    const doSearch = trimmed.length >= 2

    if (!showDefaults && !doSearch) {
      setMetricTargetSuggestions([])
      return
    }

    const handler = setTimeout(async () => {
      if (metricTargetAll) {
        if (!endpointName) {
          setMetricTargetSuggestions([])
          return
        }
        try {
          const limit = doSearch ? 20 : 5
          const query = doSearch ? trimmed : ''
          const results = await fetchJson(
            `/api/targets/search?endpointName=${encodeURIComponent(
              endpointName
            )}&q=${encodeURIComponent(query)}&types=${encodeURIComponent(metricTargetType)}&limit=${limit}`
          )
          setMetricTargetSuggestions(results)
        } catch (error) {
          console.error(error)
          setMetricTargetSuggestions([])
        }
      } else {
        const base = configTargets.filter((item) => item.typeName === metricTargetType)
        const filtered = doSearch
          ? base.filter((item) => item.name?.toLowerCase().includes(trimmed.toLowerCase()))
          : base
        setMetricTargetSuggestions(filtered.slice(0, doSearch ? 20 : 5))
      }
    }, doSearch ? 350 : 0)

    return () => clearTimeout(handler)
  }, [metricTargetQuery, metricTargetAll, metricTargetType, endpointName, configTargets, metricTargetFocused])

  useEffect(() => {
    setMetricTargetSelected(null)
    setMetricGroups([])
    setMetricSelected(null)
    setMetricLatestData(null)
    setMetricLatestError(null)
    setMetricAvailability([])
    setMetricGroupKeys(null)
    setMetricGroupKeysError(null)
  }, [metricTargetType, endpointName])

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
          <h1>Configuracao de ingestao OEM</h1>
          <p className="muted">
            Construa rapidamente arquivos YAML configurar o OEM Ingest.
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
                  <button
                    className="ghost"
                    type="button"
                    onClick={downloadTargetsYaml}
                    disabled={!configTargets.length}
                  >
                    Baixar YAML
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

          <div className="grid metrics-grid">
            <div className="metrics-left">
              <div className={`panel metrics-collapsible ${metricsCollapsed.availability ? 'collapsed' : ''}`}>
                <div className="panel-header metrics-header">
                  <div className="panel-title-row">
                    <h2>Disponibilidade de metricas</h2>
                    <button
                      className="icon-button"
                      type="button"
                      aria-label={metricsCollapsed.availability ? 'Expandir' : 'Minimizar'}
                      onClick={() =>
                        setMetricsCollapsed((prev) => ({
                          ...prev,
                          availability: !prev.availability,
                        }))
                      }
                    >
                      {metricsCollapsed.availability ? '▾' : '▴'}
                    </button>
                  </div>
                </div>
                {!metricsCollapsed.availability && (
                  <div className="panel-body">
                    <p className="muted">
                      Verifique se a metrica esta disponivel nos targets configurados.
                    </p>
                    <div className="panel-actions">
                      <button
                        className="primary"
                        type="button"
                        onClick={fetchMetricAvailability}
                        disabled={!metricSelected?.metricGroupName}
                      >
                        Buscar disponibilidade
                      </button>
                    </div>
                    <p className="muted">
                      Metrica selecionada:{' '}
                      <span className="metric-selected">{metricSelected?.metricGroupName || 'Nenhuma'}</span>
                      {metricSelected?.targetType && (
                        <span className="metric-selected-type"> | Tipo: {metricSelected.targetType}</span>
                      )}
                    </p>
                    <div className="legend">
                      <span className="legend-item available">Disponivel</span>
                      <span className="legend-item no-data">Sem dados</span>
                      <span className="legend-item unavailable">Indisponivel</span>
                    </div>
                    {metricsLoading.availability && <p className="muted">Buscando disponibilidade...</p>}
                    <div className="availability-list">
                      {metricAvailability.map((target) => (
                        <button
                          key={target.id}
                          type="button"
                          className={`availability-item ${target.status}`}
                          onClick={() =>
                            fetchLatestMetricData(
                              { id: target.id, name: target.name },
                              metricSelected?.metricGroupName,
                              metricSelected?.targetType || target.typeName
                            )
                          }
                        >
                          <span>{target.name}</span>
                          <strong>{target.status.replace('_', ' ')}</strong>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className={`panel metrics-collapsible ${metricsCollapsed.data ? 'collapsed' : ''}`}>
                <div className="panel-header metrics-header">
                  <div className="panel-title-row">
                    <h2>Dados do grupo de metricas</h2>
                    <button
                      className="icon-button"
                      type="button"
                      aria-label={metricsCollapsed.data ? 'Expandir' : 'Minimizar'}
                      onClick={() =>
                        setMetricsCollapsed((prev) => ({
                          ...prev,
                          data: !prev.data,
                        }))
                      }
                    >
                      {metricsCollapsed.data ? '▾' : '▴'}
                    </button>
                  </div>
                </div>
                {!metricsCollapsed.data && (
                  <div className="panel-body">
                    <p className="muted">Visualize os dados mais recentes do grupo selecionado.</p>
                    {!metricSelected && !metricsLoading.data && !metricLatestData && !metricLatestError && (
                      <p className="muted">Selecione um grupo para visualizar dados.</p>
                    )}
                    {metricLatestError && metricSelected && (
                      <p className="muted">
                        Grupo: <strong>{metricSelected.metricGroupName}</strong> | Target:{' '}
                        <strong>{metricSelected.targetName}</strong>
                      </p>
                    )}
                    {metricsLoading.data && <p className="muted">Carregando dados...</p>}
                    {!metricsLoading.data && metricLatestError && <p className="warning">{metricLatestError}</p>}
                    {!metricsLoading.data && metricLatestData && (() => {
                      const items = metricLatestData.items || []
                      const firstItem = items[0] || {}
                      const meta = {
                        targetName:
                          metricLatestData.targetName || firstItem.targetName || metricSelected?.targetName || '--',
                        targetType:
                          metricLatestData.targetType ||
                          metricLatestData.targetTypeName ||
                          firstItem.targetType ||
                          firstItem.targetTypeName ||
                          metricSelected?.targetType ||
                          '--',
                        metricGroupName:
                          metricLatestData.metricGroupName ||
                          firstItem.metricGroupName ||
                          metricSelected?.metricGroupName ||
                          '--',
                        timeCollected:
                          metricLatestData.timeCollected ||
                          firstItem.timeCollected ||
                          firstItem.collectionTime ||
                          null,
                        count:
                          metricLatestData.count ??
                          metricLatestData.Count ??
                          (Array.isArray(items) ? items.length : 0),
                      }

                      const renderValue = (value) => {
                        if (value === null || value === undefined) return '--'
                        if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
                          return String(value)
                        }
                        return JSON.stringify(value)
                      }

                      const renderKeys = (keys) => {
                        if (!keys) return null
                        const list = Array.isArray(keys)
                          ? keys
                          : Object.entries(keys).map(([name, value]) => ({ name, value }))
                        return (
                          <div className="metric-keys-row">
                            {list.map((key, idx) => {
                              if (typeof key === 'string') {
                                return (
                                  <span className="metric-key-badge" key={`${key}-${idx}`}>
                                    {key}
                                  </span>
                                )
                              }
                              const label = key.displayName || key.name || `Key ${idx + 1}`
                              const value = key.value ?? key.keyValue ?? key.key ?? ''
                              const text = value ? `${label}: ${value}` : label
                              return (
                                <span className="metric-key-badge" key={`${label}-${idx}`}>
                                  {text}
                                </span>
                              )
                            })}
                          </div>
                        )
                      }

                      const renderMetrics = (metrics) => {
                        if (!Array.isArray(metrics) || metrics.length === 0) return null
                        return (
                          <div className="metric-fields">
                            {metrics.map((metric) => {
                              const label = metric.displayName || metric.name || 'Metrica'
                              const value =
                                metric.value ??
                                metric.currentValue ??
                                metric.avg ??
                                metric.maximum ??
                                metric.minimum ??
                                metric.latest ??
                                metric.metricValue ??
                                null
                              const suffix = metric.unitDisplayName ? ` ${metric.unitDisplayName}` : ''
                              return (
                                <div className="metric-field" key={`${label}-${metric.name || ''}`}>
                                  <span className="metric-label">{label}</span>
                                  <span className="metric-value">
                                    {value !== null && value !== undefined ? `${value}${suffix}` : '--'}
                                  </span>
                                </div>
                              )
                            })}
                          </div>
                        )
                      }

                      const keySet = new Set(
                        (metricGroupKeys || []).map((key) => (key.name || key.displayName || '').toLowerCase())
                      )

                      return (
                        <div className="metric-data">
                          <p className="muted metric-meta-line">
                            Target: <strong>{meta.targetName}</strong> | Tipo: <strong>{meta.targetType}</strong> | Grupo:{' '}
                            <strong>{meta.metricGroupName}</strong> | Ultima coleta:{' '}
                            <strong>{meta.timeCollected ? formatDate(meta.timeCollected) : '--'}</strong> | Registros:{' '}
                            <strong>{meta.count}</strong>
                          </p>
                          <p className="muted">
                            Keys:{' '}
                            {metricGroupKeysError ? (
                              <span className="warning-inline">{metricGroupKeysError}</span>
                            ) : metricGroupKeys ? (
                              <span className="metric-keys">
                                {metricGroupKeys.length
                                  ? metricGroupKeys
                                      .map((key) => key.displayName || key.name)
                                      .filter(Boolean)
                                      .join(', ')
                                  : 'Sem keys'}
                              </span>
                            ) : (
                              <span className="metric-keys">Carregando...</span>
                            )}
                          </p>
                          <div className="metric-json-row">
                            <span className="muted">JSON</span>
                            <button
                              className="ghost"
                              type="button"
                              onClick={() => openJsonModal(metricLatestData)}
                            >
                              Ver JSON
                            </button>
                          </div>

                          {items.length === 0 && <p className="muted">Sem itens para exibir.</p>}
                          {items.length > 0 && (
                            <div className="metric-items">
                              {items.map((item, index) => {
                                const entries = Object.entries(item || {}).filter(
                                  ([key]) => !['metrics', 'metricValues', 'keys'].includes(key)
                                )
                                return (
                                  <div className="metric-item-block" key={`metric-item-${index}`}>
                                    {renderKeys(item.keys)}
                                    {renderMetrics(item.metrics || item.metricValues)}
                                    {entries.length > 0 && (
                                      <div className="metric-fields">
                                        {entries.map(([key, value]) => (
                                          <div
                                            className={`metric-field ${
                                              keySet.has(key.toLowerCase()) ? 'metric-field-key' : ''
                                            }`}
                                            key={key}
                                          >
                                            <span className="metric-label">{key}:</span>
                                            <span className="metric-value">{renderValue(value)}</span>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                    {index < items.length - 1 && <div className="metric-divider">------------</div>}
                                  </div>
                                )
                              })}
                            </div>
                          )}
                        </div>
                      )
                    })()}
                  </div>
                )}
              </div>

              <div className="panel">
                <div className="panel-header">
                  <div>
                    <h2>Pesquisa de metricas</h2>
                    <p className="muted">
                      Selecione um target para listar grupos de metricas disponiveis.
                    </p>
                  </div>
                </div>
                {metricsNotice && <div className={`notice ${metricsNotice.kind}`}>{metricsNotice.text}</div>}

                <div className="field-row">
                  <div className="field">
                    <label>Tipo de target</label>
                    <select
                      value={metricTargetType}
                      onChange={(event) => setMetricTargetType(event.target.value)}
                    >
                      <option value="">Selecione</option>
                      {metricTypes.map((typeName) => (
                        <option key={typeName} value={typeName}>
                          {typeName}
                        </option>
                      ))}
                    </select>
                  </div>
                  <label className="checkbox">
                    <input
                      type="checkbox"
                      checked={metricTargetAll}
                      onChange={(event) => setMetricTargetAll(event.target.checked)}
                    />
                    Todos os targets
                  </label>
                </div>

                <input
                  className="search-input"
                  placeholder="Pesquisar target"
                  value={metricTargetQuery}
                  onChange={(event) => setMetricTargetQuery(event.target.value)}
                  onFocus={() => setMetricTargetFocused(true)}
                  onBlur={() => {
                    setTimeout(() => setMetricTargetFocused(false), 120)
                  }}
                />

                {metricTargetSuggestions.length > 0 && (
                  <div className="suggestions">
                    {metricTargetSuggestions.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        className="suggestion-item"
                        onClick={() => {
                          setMetricTargetSelected(item)
                          setMetricTargetQuery('')
                          setMetricTargetSuggestions([])
                          fetchMetricGroups(item)
                        }}
                      >
                        {item.name} | {item.typeName}
                      </button>
                    ))}
                  </div>
                )}

                {metricTargetSelected && (
                  <div className="selected-target">
                    <span>
                      Target selecionado: <strong>{metricTargetSelected.name}</strong>
                    </span>
                    <button
                      className="ghost"
                      type="button"
                      onClick={() => {
                        setMetricTargetSelected(null)
                        setMetricGroups([])
                      }}
                    >
                      Trocar
                    </button>
                  </div>
                )}

                {metricsLoading.groups && <p className="muted">Carregando grupos...</p>}
                {!metricsLoading.groups && metricTargetSelected && metricGroups.length === 0 && (
                  <p className="muted">Nenhum grupo encontrado.</p>
                )}

                <div className="metric-group-list">
                  <div className="card-list">
                    {metricGroups.map((group) => {
                      const isExpanded = !!expandedMetricGroups[group.name]
                      return (
                        <div
                          className={`card metric-group-card ${
                            metricGroupHighlighted === group.name ? 'metric-group-active' : ''
                          }`}
                          key={group.name}
                        >
                          <div className="metric-group-header">
                            <button
                              className="collapse-toggle"
                              type="button"
                              onClick={() =>
                                setExpandedMetricGroups((prev) => ({
                                  ...prev,
                                  [group.name]: !prev[group.name],
                                }))
                              }
                            >
                              <span className="target-name">{group.displayName || group.name}</span>
                            </button>
                            <div className="target-actions">
                              <button
                                className="ghost"
                                type="button"
                                onClick={() => addMetricGroupToConfig(metricTargetType, group.name)}
                              >
                                Adicionar
                              </button>
                                <button
                                  className="primary"
                                  type="button"
                                  onClick={() => {
                                    setMetricGroupHighlighted(group.name)
                                    fetchLatestMetricData(metricTargetSelected, group.name, metricTargetType, {
                                      expandAvailability: true,
                                      clearAvailability: true,
                                    })
                                  }}
                                  disabled={!metricTargetSelected}
                                >
                                Search
                              </button>
                            </div>
                          </div>
                          {isExpanded && (
                            <div className="metric-metrics">
                              {(group.metrics || []).map((metric) => (
                                <div className="metric-item" key={metric.id || metric.name}>
                                  <strong>{metric.displayName || metric.name}</strong>
                                  <span className="muted">{metric.name}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>

            <div className="panel">
              <div className="panel-header">
                <div>
                  <h2>Configuracao de metricas</h2>
                  <p className="muted">Edite frequencias e salve o YAML.</p>
                </div>
                <div className="panel-actions">
                  <button className="ghost" type="button" onClick={loadMetricsConfig}>
                    Recarregar YAML
                  </button>
                  <button
                    className="ghost"
                    type="button"
                    onClick={downloadMetricsYaml}
                    disabled={Object.keys(metricsConfig).length === 0}
                  >
                    Baixar YAML
                  </button>
                  <button className="primary" type="button" onClick={saveMetricsConfig}>
                    Salvar configuracao
                  </button>
                </div>
              </div>
              {metricsDirty && <p className="warning">Voce possui alteracoes nao salvas.</p>}
              {Object.keys(metricsConfig).length === 0 && (
                <p className="muted">Nenhuma metrica configurada.</p>
              )}

              <div className="card-list">
                {newMetricItems.length > 0 && (
                  <div className="type-section">
                    <h3 className="type-title">new</h3>
                    <div className="type-list">
                      {newMetricItems.map((metric) => {
                        const isNew = newMetricKeys.has(metric._key)
                        const isModified = !isNew && modifiedMetricKeys.has(metric._key)
                        return (
                          <div
                            className={`card metric-config-card ${
                              isNew ? 'new-metric' : isModified ? 'modified-metric' : ''
                            }`}
                            key={metric._key}
                          >
                            <div className="metric-config-row">
                              <div>
                                <div className="metric-config-name">
                                  <strong>{metric.metric_group_name}</strong>
                                  <span className="metric-type">: {metric._typeName}</span>
                                </div>
                              </div>
                              <div className="metric-config-actions">
                                <label className="metric-freq">
                                  <span>Freq (min)</span>
                                  <input
                                    type="number"
                                    min="1"
                                    value={metric.freq}
                                    onChange={(event) =>
                                      updateMetricFreq(metric._typeName, metric._index, event.target.value)
                                    }
                                  />
                                </label>
                                <button
                                  className="icon-action"
                                  type="button"
                                  aria-label="Disponibilidade"
                                  title="Disponibilidade"
                                  onClick={() =>
                                    selectMetricFromConfig(metric._typeName, metric.metric_group_name)
                                  }
                                >
                                  <svg viewBox="0 0 24 24" aria-hidden="true">
                                    <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
                                    <path d="M20 20l-3.5-3.5" fill="none" stroke="currentColor" strokeWidth="2" />
                                  </svg>
                                </button>
                                <button
                                  className="icon-action"
                                  type="button"
                                  aria-label="Remover"
                                  title="Remover"
                                  onClick={() => removeMetricGroup(metric._typeName, metric._index)}
                                >
                                  <svg viewBox="0 0 24 24" aria-hidden="true">
                                    <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
                                    <path d="M8 12h8" fill="none" stroke="currentColor" strokeWidth="2" />
                                  </svg>
                                </button>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
                {groupedMetricsConfig.map(([typeName, items]) => (
                  <div key={typeName} className="type-section">
                    <h3 className="type-title">{typeName}</h3>
                    <div className="type-list">
                      {items.map((metric) => {
                        const isNew = newMetricKeys.has(metric._key)
                        const isModified = !isNew && modifiedMetricKeys.has(metric._key)
                        return (
                          <div
                            className={`card metric-config-card ${
                              isNew ? 'new-metric' : isModified ? 'modified-metric' : ''
                            }`}
                            key={metric._key}
                          >
                            <div className="metric-config-row">
                              <div>
                                <div className="metric-config-name">
                                  <strong>{metric.metric_group_name}</strong>
                                  <span className="metric-type">: {typeName}</span>
                                </div>
                              </div>
                              <div className="metric-config-actions">
                                <label className="metric-freq">
                                  <span>Freq (min)</span>
                                  <input
                                    type="number"
                                    min="1"
                                    value={metric.freq}
                                    onChange={(event) =>
                                      updateMetricFreq(typeName, metric._index, event.target.value)
                                    }
                                  />
                                </label>
                                <button
                                  className="icon-action"
                                  type="button"
                                  aria-label="Disponibilidade"
                                  title="Disponibilidade"
                                  onClick={() => selectMetricFromConfig(typeName, metric.metric_group_name)}
                                >
                                  <svg viewBox="0 0 24 24" aria-hidden="true">
                                    <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
                                    <path d="M20 20l-3.5-3.5" fill="none" stroke="currentColor" strokeWidth="2" />
                                  </svg>
                                </button>
                                <button
                                  className="icon-action"
                                  type="button"
                                  aria-label="Remover"
                                  title="Remover"
                                  onClick={() => removeMetricGroup(typeName, metric._index)}
                                >
                                  <svg viewBox="0 0 24 24" aria-hidden="true">
                                    <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" />
                                    <path d="M8 12h8" fill="none" stroke="currentColor" strokeWidth="2" />
                                  </svg>
                                </button>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
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

      {jsonModal.open && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal">
            <div className="modal-header">
              <div>
                <h3>JSON completo</h3>
                <p className="muted">Visualizacao completa do resultado.</p>
              </div>
              <button className="ghost" type="button" onClick={closeJsonModal}>
                Fechar
              </button>
            </div>
            <div className="modal-body">
              <pre className="code-block">{JSON.stringify(jsonModal.data, null, 2)}</pre>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
