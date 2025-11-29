import { Range, getTrackBackground } from 'react-range'
import Select from 'react-select'
import React, { useEffect, useState, useCallback, useMemo } from 'react'
import './RecipeList.css'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

// Time parsing utility
function parseTimeToMinutes(t) {
  if (!t) return 0
  const lower = String(t).toLowerCase()
  let minutes = 0
  const hMatch = lower.match(/(\d+)\s*(godz|godz\.|h)\b/)
  if (hMatch) minutes += parseInt(hMatch[1], 10) * 60
  const mMatch = lower.match(/(\d+)\s*min\b/)
  if (mMatch) minutes += parseInt(mMatch[1], 10)
  if (!hMatch && !mMatch) {
    const num = lower.match(/(\d+)/)
    if (num) minutes = parseInt(num[1], 10)
  }
  return minutes
}

// Format minutes to readable time
function formatTime(minutes) {
  if (!minutes || minutes <= 0) return '—'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (h > 0 && m > 0) return `${h}h ${m}min`
  if (h > 0) return `${h}h`
  return `${m}min`
}

// Non-linear popularity steps: 0, 10-100 by 10, 200-1000 by 100, 2000-10000 by 1000, 20000-30000 by 10000
const POPULARITY_STEPS = [
  0,
  10, 20, 30, 40, 50, 60, 70, 80, 90, 100,
  200, 300, 400, 500, 600, 700, 800, 900, 1000,
  2000, 3000, 4000, 5000, 6000, 7000, 8000, 9000, 10000,
  20000, 30000
]

// Convert slider index to actual value
function indexToPopularity(index) {
  return POPULARITY_STEPS[Math.min(index, POPULARITY_STEPS.length - 1)]
}

// Format popularity for display
function formatPopularity(value) {
  if (value >= 1000) {
    return `${(value / 1000).toFixed(value % 1000 === 0 ? 0 : 1)}k`
  }
  return value.toString()
}

// Loading skeleton component
function SkeletonCard() {
  return (
    <div className="skeleton-card">
      <div className="skeleton-image" />
      <div className="skeleton-content">
        <div className="skeleton-title" />
        <div className="skeleton-meta">
          <div className="skeleton-text" />
          <div className="skeleton-text" />
        </div>
      </div>
    </div>
  )
}

// Difficulty dots component
function DifficultyDots({ level }) {
  const labels = ['easy', 'medium', 'hard']
  return (
    <div className="difficulty-dots">
      {[1, 2, 3].map((dot) => (
        <span
          key={dot}
          className={`difficulty-dot ${dot <= level ? `active ${labels[level - 1]}` : ''}`}
        />
      ))}
    </div>
  )
}

export default function RecipeList() {
  // State
  const [q, setQ] = useState('')
  const [items, setItems] = useState([])
  const [page, setPage] = useState(1)
  const [perPage] = useState(36)
  const [total, setTotal] = useState(0)
  const [sort, setSort] = useState('')
  const [desc, setDesc] = useState(false)
  const [loading, setLoading] = useState(false)
  const [selectedRecipe, setSelectedRecipe] = useState(null)
  const [error, setError] = useState(null)
  const [ratingRange, setRatingRange] = useState([1, 5])
  const [numRatingsRangeIdx, setNumRatingsRangeIdx] = useState([0, POPULARITY_STEPS.length - 1])
  const [seed, setSeed] = useState(() => Math.floor(Math.random() * 1e9))
  const [allIngredients, setAllIngredients] = useState([])
  const [includeIngredients, setIncludeIngredients] = useState([])
  const [excludeIngredients, setExcludeIngredients] = useState([])
  const [firstLoad, setFirstLoad] = useState(true)
  const [categories, setCategories] = useState([])
  const [allCategories, setAllCategories] = useState([])
  const [catOpen, setCatOpen] = useState(false)
  const [filtersOpen, setFiltersOpen] = useState(true)
  const [languageFilter, setLanguageFilter] = useState({
    ENG: true,
    PL: true,
  })

  // Memoized ingredient options for react-select
  const ingredientOptions = useMemo(
    () => allIngredients.map((i) => ({ value: i.id, label: i.name })),
    [allIngredients]
  )

  // Fetch list function
  const fetchList = useCallback(async (first = false) => {
    setLoading(true)
    setError(null)

    const params = new URLSearchParams()
    if (q) params.set('q', q)
    params.set('page', page)
    params.set('per_page', perPage)
    if (sort) params.set('sort', sort)
    if (desc) params.set('desc', 'true')
    if (first) params.set('first_load', 'true')

    params.set('rating_min', ratingRange[0])
    params.set('rating_max', ratingRange[1])
    params.set('num_ratings_min', indexToPopularity(numRatingsRangeIdx[0]))
    params.set('num_ratings_max', indexToPopularity(numRatingsRangeIdx[1]))
    params.set('seed', seed)

    const enabledLanguages = Object.entries(languageFilter)
      .filter(([, enabled]) => enabled)
      .map(([lang]) => lang)

    if (enabledLanguages.length === 1) {
      params.set('language', enabledLanguages[0])
    }

    if (categories.length > 0) {
      categories.forEach((cat) => params.append('categories', cat))
    }

    if (includeIngredients.length > 0) {
      includeIngredients.forEach((id) => params.append('includeIngredients', id))
    }

    if (excludeIngredients.length > 0) {
      excludeIngredients.forEach((id) => params.append('excludeIngredients', id))
    }

    try {
      if (first || (!sort && !desc)) params.set('randomize', 'true')
      const res = await fetch(`${API}/api/recipes?${params.toString()}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setItems(data.items)
      setTotal(data.total)
    } catch (e) {
      console.error(e)
      setError('Failed to load recipes. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [q, page, perPage, sort, desc, ratingRange, numRatingsRangeIdx, seed, languageFilter, categories, includeIngredients, excludeIngredients])

  // Initial load + sort/desc changes
  useEffect(() => {
    fetchList(firstLoad)
    if (firstLoad) setFirstLoad(false)
  }, [page, sort, desc])

  // Load categories
  useEffect(() => {
    async function loadCategories() {
      try {
        const res = await fetch(`${API}/api/categories`)
        const data = await res.json()
        setAllCategories(data)
      } catch (e) {
        console.error('Failed to load categories:', e)
      }
    }
    loadCategories()
  }, [])

  // Load ingredients
  useEffect(() => {
    async function loadIngredients() {
      try {
        const res = await fetch(`${API}/api/ingredients`)
        if (!res.ok) throw new Error('Failed to load ingredients')
        const data = await res.json()
        setAllIngredients(data)
      } catch (e) {
        console.error('Failed to load ingredients:', e)
        setAllIngredients([])
      }
    }
    loadIngredients()
  }, [])

  // Debounced filter changes
  useEffect(() => {
    if (firstLoad) return
    // Reset to page 1 when filters change
    if (page !== 1) {
      setPage(1)
      return // The page change will trigger a fetch
    }
    const delay = setTimeout(() => fetchList(false), 400)
    return () => clearTimeout(delay)
  }, [q, ratingRange, numRatingsRangeIdx, categories, languageFilter, includeIngredients, excludeIngredients])

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (!e.target.closest('.dropdown')) setCatOpen(false)
    }
    document.addEventListener('click', handleClickOutside)
    return () => document.removeEventListener('click', handleClickOutside)
  }, [])

  // Sort handler - first click descending, second click ascending
  function changeSort(field) {
    if (sort === field) {
      setDesc(!desc)
    } else {
      setSort(field)
      setDesc(true) // Start with descending order
    }
    // Reset seed for new sort
    setSeed(Math.floor(Math.random() * 1e9))
  }

  // Language toggle
  function toggleLanguage(lang) {
    setLanguageFilter((prev) => ({
      ...prev,
      [lang]: !prev[lang],
    }))
  }

  // Open recipe modal
  async function openRecipe(id) {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`${API}/api/recipes/${id}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setSelectedRecipe(data)
    } catch (e) {
      console.error(e)
      setError('Failed to load recipe details.')
    } finally {
      setLoading(false)
    }
  }

  // Close modal
  function closeModal() {
    setSelectedRecipe(null)
  }

  // Handle keyboard for modal
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === 'Escape' && selectedRecipe) {
        closeModal()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [selectedRecipe])

  const totalPages = Math.ceil(total / perPage)

  return (
    <div className="recipe-list-container">
      {/* Search Section */}
      <section className="search-section">
        <form className="search-form" onSubmit={(e) => e.preventDefault()}>
          <div className="search-bar">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search for recipes, ingredients..."
            />
            {q && (
              <button
                type="button"
                className="clear-btn"
                onClick={() => setQ('')}
                aria-label="Clear search"
              >
                ✕
              </button>
            )}
          </div>
        </form>

        {/* Sort Buttons */}
        <div className="sort-buttons">
          <span>Sort by:</span>
          {[
            { key: 'rating', label: 'Rating', icon: '⭐' },
            { key: 'numberOfRatings', label: 'Popularity', icon: '👥' },
            { key: 'preparationTime', label: 'Prep Time', icon: '⏱️' },
            { key: 'totalTime', label: 'Total Time', icon: '🕐' },
          ].map((opt) => (
            <button
              key={opt.key}
              className={`${sort === opt.key ? 'active' : ''} ${sort === opt.key && desc ? 'desc' : ''}`}
              onClick={() => changeSort(opt.key)}
            >
              {opt.icon} {opt.label}
              {sort === opt.key && <span className="sort-arrow">↑</span>}
            </button>
          ))}
        </div>

        {/* Filters */}
        <div className="filters-wrapper">
          <button
            className="filters-toggle"
            onClick={() => setFiltersOpen(!filtersOpen)}
          >
            <h3>
              <span>🎛️</span> Filters
              {(categories.length > 0 || includeIngredients.length > 0 || excludeIngredients.length > 0) && (
                <span style={{ 
                  background: 'var(--color-primary)', 
                  color: 'white', 
                  padding: '2px 8px', 
                  borderRadius: 'var(--radius-full)',
                  fontSize: '0.75rem'
                }}>
                  Active
                </span>
              )}
            </h3>
            <span className={`filters-toggle-icon ${filtersOpen ? 'open' : ''}`}>▼</span>
          </button>

          {filtersOpen && (
            <div className="filters">
              {/* Rating Filter */}
              <div className="filter">
                <label>Rating</label>
                <div className="range-wrapper">
                  <Range
                    step={0.1}
                    min={1}
                    max={5}
                    values={ratingRange}
                    onChange={setRatingRange}
                    renderTrack={({ props, children }) => (
                      <div
                        {...props}
                        className="range-track"
                        style={{
                          ...props.style,
                          background: getTrackBackground({
                            values: ratingRange,
                            colors: ['var(--color-border)', 'var(--color-primary)', 'var(--color-border)'],
                            min: 1,
                            max: 5,
                          }),
                        }}
                      >
                        {children}
                      </div>
                    )}
                    renderThumb={({ props, index }) => (
                      <div {...props} key={index} className="range-thumb" />
                    )}
                  />
                  <div className="range-values">
                    <span>⭐ {ratingRange[0].toFixed(1)}</span>
                    <span>⭐ {ratingRange[1].toFixed(1)}</span>
                  </div>
                </div>
              </div>

              {/* Number of Ratings Filter */}
              <div className="filter">
                <label>Popularity</label>
                <div className="range-wrapper">
                  <Range
                    step={1}
                    min={0}
                    max={POPULARITY_STEPS.length - 1}
                    values={numRatingsRangeIdx}
                    onChange={setNumRatingsRangeIdx}
                    renderTrack={({ props, children }) => (
                      <div
                        {...props}
                        className="range-track"
                        style={{
                          ...props.style,
                          background: getTrackBackground({
                            values: numRatingsRangeIdx,
                            colors: ['var(--color-border)', 'var(--color-primary)', 'var(--color-border)'],
                            min: 0,
                            max: POPULARITY_STEPS.length - 1,
                          }),
                        }}
                      >
                        {children}
                      </div>
                    )}
                    renderThumb={({ props, index }) => (
                      <div {...props} key={index} className="range-thumb" />
                    )}
                  />
                  <div className="range-values">
                    <span>{formatPopularity(indexToPopularity(numRatingsRangeIdx[0]))}</span>
                    <span>{formatPopularity(indexToPopularity(numRatingsRangeIdx[1]))}</span>
                  </div>
                </div>
              </div>

              {/* Language Filter */}
              <div className="filter">
                <label>Language</label>
                <div className="language-buttons">
                  <button
                    className={languageFilter.ENG ? 'active' : ''}
                    onClick={() => toggleLanguage('ENG')}
                  >
                    🇬🇧 English
                  </button>
                  <button
                    className={languageFilter.PL ? 'active' : ''}
                    onClick={() => toggleLanguage('PL')}
                  >
                    🇵🇱 Polski
                  </button>
                </div>
              </div>

              {/* Categories Filter */}
              <div className="filter">
                <label>Categories</label>
                <div className="dropdown">
                  <button
                    type="button"
                    className="dropdown-toggle"
                    onClick={() => setCatOpen((o) => !o)}
                  >
                    {categories.length > 0
                      ? `${categories.length} selected`
                      : 'All categories'}
                  </button>

                  {catOpen && (
                    <div className="dropdown-menu">
                      {allCategories.map((cat) => (
                        <label key={cat} className="dropdown-item">
                          <input
                            type="checkbox"
                            checked={categories.includes(cat)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setCategories((prev) => [...prev, cat])
                              } else {
                                setCategories((prev) => prev.filter((c) => c !== cat))
                              }
                            }}
                          />
                          {cat}
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Include Ingredients */}
              <div className="filter" style={{ minWidth: '250px' }}>
                <label>Must Include</label>
                <Select
                  isMulti
                  options={ingredientOptions}
                  value={ingredientOptions.filter((i) =>
                    includeIngredients.includes(i.value)
                  )}
                  onChange={(selected) =>
                    setIncludeIngredients(selected.map((s) => s.value))
                  }
                  placeholder="Select ingredients..."
                  classNamePrefix="react-select"
                  noOptionsMessage={() => 'No ingredients found'}
                />
              </div>

              {/* Exclude Ingredients */}
              <div className="filter" style={{ minWidth: '250px' }}>
                <label>Must Exclude</label>
                <Select
                  isMulti
                  options={ingredientOptions}
                  value={ingredientOptions.filter((i) =>
                    excludeIngredients.includes(i.value)
                  )}
                  onChange={(selected) =>
                    setExcludeIngredients(selected.map((s) => s.value))
                  }
                  placeholder="Select ingredients..."
                  classNamePrefix="react-select"
                  noOptionsMessage={() => 'No ingredients found'}
                />
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Results */}
      {loading && items.length === 0 ? (
        <div className="skeleton-grid">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : error ? (
        <div className="error-container">
          <div className="error-icon">😕</div>
          <p className="error-message">{error}</p>
          <p className="error-hint">Check your connection and try again</p>
        </div>
      ) : items.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">🍽️</div>
          <h3 className="empty-title">No recipes found</h3>
          <p className="empty-text">Try adjusting your filters or search terms</p>
        </div>
      ) : (
        <>
          {/* Recipe Grid */}
          <div className="recipes-grid">
            {items.map((it, index) => (
              <div
                key={it.id}
                className="recipe-card"
                style={{ animationDelay: `${(index % 6) * 50}ms` }}
                onClick={() => openRecipe(it.id)}
              >
                <div className="recipe-image-wrapper">
                  <img
                    src={`${API}/images/recipes/small/${it.id}.jpeg`}
                    alt={it.title}
                    className="recipe-image"
                    loading="lazy"
                  />
                  {it.rating && (
                    <div className="recipe-badge">
                      <span className="rating-star">⭐</span>
                      {it.rating.toFixed(1)}
                    </div>
                  )}
                </div>
                <div className="recipe-info">
                  <h3 className="recipe-title">{it.title}</h3>
                  <div className="recipe-meta">
                    <div className="rating-info">
                      <span className="num-ratings">
                        👥 {it.numberOfRatings?.toLocaleString() ?? 0}
                      </span>
                    </div>
                    <span className="total-time">
                      🕐 {formatTime(it.totalTime)}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          <div className="pagination">
            <button
              onClick={() => setPage((p) => Math.max(p - 1, 1))}
              disabled={page === 1}
            >
              ← Previous
            </button>
            <span>
              Page {page} of {totalPages || 1} • {total.toLocaleString()} recipes
            </span>
            <button
              onClick={() => setPage((p) => Math.min(p + 1, totalPages))}
              disabled={page >= totalPages}
            >
              Next →
            </button>
          </div>
        </>
      )}

      {/* Recipe Modal */}
      {selectedRecipe && (
        <div className="modal" onClick={closeModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button
              className="modal-close-btn"
              onClick={closeModal}
              aria-label="Close"
            >
              ✕
            </button>

            {/* Header with image */}
            <div className="modal-header">
              <img
                className="modal-image"
                src={`${API}/images/recipes/large/${selectedRecipe.id}.jpeg`}
                alt={selectedRecipe.title}
              />
              <div className="modal-image-overlay" />
              <div className="modal-title-wrapper">
                <h2 className="modal-title">{selectedRecipe.title}</h2>
              </div>
            </div>

            <div className="modal-body">
              {/* Stats */}
              <div className="recipe-stats">
                <div className="stat-card">
                  <div className="stat-icon">⭐</div>
                  <div className="stat-value">{selectedRecipe.rating?.toFixed(1) || '—'}</div>
                  <div className="stat-label">Rating</div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon">👥</div>
                  <div className="stat-value">
                    {selectedRecipe.numberOfRatings?.toLocaleString() || 0}
                  </div>
                  <div className="stat-label">Reviews</div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon">⏱️</div>
                  <div className="stat-value">
                    {formatTime(selectedRecipe.preparationTime)}
                  </div>
                  <div className="stat-label">Prep Time</div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon">🕐</div>
                  <div className="stat-value">
                    {formatTime(selectedRecipe.totalTime)}
                  </div>
                  <div className="stat-label">Total Time</div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon">🍽️</div>
                  <div className="stat-value">
                    {selectedRecipe.numberOfPortions || '—'}
                  </div>
                  <div className="stat-label">Servings</div>
                </div>
                <div className="stat-card">
                  <div className="stat-icon">📊</div>
                  <div className="stat-value">
                    <DifficultyDots level={selectedRecipe.difficultyLevel || 1} />
                  </div>
                  <div className="stat-label">Difficulty</div>
                </div>
              </div>

              {/* Ingredients */}
              {selectedRecipe.data?.ingredients?.length > 0 && (
                <div className="modal-section">
                  <h3 className="section-title">Ingredients</h3>
                  <ul className="ingredients-list">
                    {selectedRecipe.data.ingredients.map((name, idx) => {
                      const id = selectedRecipe.data.ingredientIds?.[idx]
                      const imgUrl = id ? `${API}/images/ingredients/${id}.png` : null
                      return (
                        <li key={idx} className="ingredient-item">
                          {imgUrl && (
                            <img
                              src={imgUrl}
                              alt=""
                              onError={(e) => (e.target.style.display = 'none')}
                            />
                          )}
                          <span>{name}</span>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              )}

              {/* Steps */}
              {selectedRecipe.data?.recipe?.length > 0 && (
                <div className="modal-section">
                  <h3 className="section-title">Instructions</h3>
                  <ol className="steps-list">
                    {selectedRecipe.data.recipe.map((step, idx) => (
                      <li key={idx}>{step}</li>
                    ))}
                  </ol>
                </div>
              )}

              {/* Nutrition */}
              {selectedRecipe.data?.nutrition?.values && (
                <div className="modal-section">
                  <h3 className="section-title">Nutrition per Serving</h3>
                  <div className="nutrition-grid">
                    {Object.entries(selectedRecipe.data.nutrition.values).map(
                      ([key, value]) => (
                        <div key={key} className="nutrition-item">
                          <div className="nutrition-value">{value}</div>
                          <div className="nutrition-label">{key}</div>
                        </div>
                      )
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
