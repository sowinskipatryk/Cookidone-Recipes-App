// RANDOMIZE RESULTS AT INITIAL LOAD TO SHOW DIVERSITY

import React, { useEffect, useState } from 'react'
import './RecipeList.css'

const API = import.meta.env.VITE_API_URL || 'http://localhost:8000'

																		 
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

export default function RecipeList() {
  const [q, setQ] = useState('')
  const [items, setItems] = useState([])
  const [page, setPage] = useState(1)
  const [perPage] = useState(10)
  const [total, setTotal] = useState(0)
  const [sort, setSort] = useState('')
  const [desc, setDesc] = useState(false)
  const [loading, setLoading] = useState(false)
  const [selectedRecipe, setSelectedRecipe] = useState(null)
  const [error, setError] = useState(null)
  const [ratingRange, setRatingRange] = useState([0, 5])
  const [numRatingsRange, setNumRatingsRange] = useState([0, 5000])

  useEffect(() => { fetchList() }, [page, sort, desc])
  useEffect(() => {
			   
						

												   
				   
    const delay = setTimeout(() => fetchList(), 500)
				 
		   
    return () => clearTimeout(delay)
  }, [q])

													 
  function getSortValue(it, field) {
    if (!field) return 0
    if (field === 'preparationTime' || field === 'totalTime') return parseTimeToMinutes(it[field])
										  
	 
    if (field === 'rating' || field === 'numberOfRatings') return Number(it[field] ?? 0)
								   
	 
    return it[field]
  }

									   
  function applyClientSort(arr) {
    if (!sort) return arr
    const copy = [...arr]
    copy.sort((a, b) => {
      const va = getSortValue(a, sort)
      const vb = getSortValue(b, sort)

      if (typeof va === 'number' && typeof vb === 'number') return desc ? vb - va : va - vb
      return desc ? String(vb).localeCompare(String(va)) : String(va).localeCompare(String(vb))
	   

								 
								 
																						 
							  
    })
    return copy
  }

									 
  async function fetchList() {
    setLoading(true)
    setError(null)

    const params = new URLSearchParams()
    if (q) params.set('q', q)
    params.set('page', page)
    params.set('per_page', perPage)
    if (sort) params.set('sort', sort)
    if (desc) params.set('desc', 'true')

														 

    try {
      const res = await fetch(`${API}/api/recipes?${params.toString()}`)
      const data = await res.json()
      setItems(applyClientSort(data.items || []))
											 
					  
      setTotal(data.total || 0)
				 
					  
    } catch(e) { console.error(e); setError('Failed to load recipes.') }
			   
    finally { setLoading(false) }
	 
  }

  function changeSort(field) { if (sort===field) setDesc(!desc); else { setSort(field); setDesc(false) } }
							  
									  
		  
					
					
	 
   

										   
  async function openRecipe(id) {
    setLoading(true)
    setError(null)
    try {
					  
					
      const res = await fetch(`${API}/api/recipes/${id}`)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setSelectedRecipe(data)
				 
					  
    } catch(e) { console.error(e); setError('Failed to load recipe details.') }
			   
    finally { setLoading(false) }
	 
  }

						 
						   
   

  return (
    <div className="recipe-list-container">
      <form className="search-form">
										 
			  
				   
												
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search by title or ingredient" />
        <button type="button" onClick={() => { setQ(''); fetchList() }}>Clear</button>
			   
					   
						  
					
					   
			
		 
			   
				 
      </form>

      <div className="sort-buttons">
									   
        <label>Sort:</label>
        <button onClick={() => changeSort('rating')}>Rating</button>
																  
				 
        <button onClick={() => changeSort('numberOfRatings')}>#Ratings</button>
																			 
				 
        <button onClick={() => changeSort('preparationTime')}>Prep Time</button>
																			  
				 
        <button onClick={() => changeSort('totalTime')}>Total Time</button>
																		 
				 
      </div>

      <div className="filters">
        <div className="filter">
          <label>Rating: {ratingRange[0]} - {ratingRange[1]}</label>
          <input
            type="range"
            min="0"
            max="5"
            step="0.1"
            value={ratingRange[0]}
            onChange={e => setRatingRange([Number(e.target.value), ratingRange[1]])}
          />
          <input
            type="range"
            min="0"
            max="5"
            step="0.1"
            value={ratingRange[1]}
            onChange={e => setRatingRange([ratingRange[0], Number(e.target.value)])}
          />
        </div>

        <div className="filter">
          <label>#Ratings: {numRatingsRange[0]} - {numRatingsRange[1]}</label>
          <input
            type="range"
            min="0"
            max="5000"  // dopasuj do max liczby ocen w bazie
            step="1"
            value={numRatingsRange[0]}
            onChange={e => setNumRatingsRange([Number(e.target.value), numRatingsRange[1]])}
          />
          <input
            type="range"
            min="0"
            max="5000"
            step="1"
            value={numRatingsRange[1]}
            onChange={e => setNumRatingsRange([numRatingsRange[0], Number(e.target.value)])}
          />
        </div>
      </div>


      {loading ? <div>Loading...</div> : error ? <div className="error">{error}</div> : (
				  
							 
				   
												   
		   
        <>
        <table className="recipes-table">
          <thead>
            <tr>
              <th>Image</th>
              <th>Title</th>
              <th>Rating</th>
              <th>#Ratings</th>
              <th>Prep Time</th>
              <th>Total Time</th>
            </tr>
          </thead>
          <tbody>
            {items
              .filter(it => it.rating >= ratingRange[0] && it.rating <= ratingRange[1])
              .filter(it => it.numberOfRatings >= numRatingsRange[0] && it.numberOfRatings <= numRatingsRange[1])
              .map(it => (
                <tr key={it.id} onClick={() => openRecipe(it.id)} style={{ cursor: 'pointer' }}>
                  <td>
                    <img src={`${API}/images/small/${it.id}.jpeg`} alt="" />
                  </td>
                  <td>{it.title}</td>
                  <td>{it.rating}</td>
                  <td>{it.numberOfRatings}</td>
                  <td>{it.preparationTime}</td>
                  <td>{it.totalTime}</td>
                </tr>
            ))}
          </tbody>
        </table>
																						  
				 
						 
																  
								 
		   
					
				   

        {/* Paginacja */}
        <div className="pagination">
          <button onClick={() => setPage(p => Math.max(p-1,1))} disabled={page===1}>Previous</button>
          <span>Page {page} of {Math.ceil(total/perPage)}</span>

				 
						 
          <button onClick={() => setPage(p => Math.min(p+1, Math.ceil(total/perPage)))} disabled={page===Math.ceil(total/perPage)}>Next</button>
														  
		   
				
				   
        </div>
        </>
      )}

      {/* Modal overlay */}
      {selectedRecipe && (
        <div className="modal" onClick={() => setSelectedRecipe(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <button className="close-btn" onClick={() => setSelectedRecipe(null)}>Close</button>
            <h2>{selectedRecipe.title}</h2>
            <p><strong>Rating:</strong> {selectedRecipe.rating}</p>
            <p><strong>#Ratings:</strong> {selectedRecipe.numberOfRatings}</p>
            <p><strong>Prep Time:</strong> {selectedRecipe.preparationTime}</p>
            <p><strong>Total Time:</strong> {selectedRecipe.totalTime}</p>
            <p><strong>Portions:</strong> {selectedRecipe.numberOfPortions}</p>
																			 

            {selectedRecipe.ingredients && (
              <div>
                <h3>Ingredients:</h3>
					
                <ul>{selectedRecipe.ingredients.map((ing, idx) => <li key={idx}>{ing}</li>)}</ul>
					 
              </div>
            )}

            {selectedRecipe.recipe && (
              <div>
                <h3>Steps:</h3>
					
                <ol>{selectedRecipe.recipe.map((step, idx) => <li key={idx}>{step}</li>)}</ol>
					 
              </div>
            )}

            {selectedRecipe.tips && (
              <div>
                <h3>Tips:</h3>
					
                <ul>{selectedRecipe.tips.map((tip, idx) => <li key={idx}>{tip}</li>)}</ul>
					 
              </div>
            )}

            {selectedRecipe.usefulItems && (
              <div>
                <h3>Useful Items:</h3>
					
                <ul>{selectedRecipe.usefulItems.map((item, idx) => <li key={idx}>{item}</li>)}</ul>
					 
              </div>
            )}

            {selectedRecipe.difficultyLevel && (
              <p><strong>Difficulty:</strong> {selectedRecipe.difficultyLevel}</p>
            )}

            {selectedRecipe.nutrition && (
              <div>
                <h3>Nutrition ({selectedRecipe.nutrition.perServing})</h3>
                <ul>
                  {Object.entries(selectedRecipe.nutrition.values).map(([key,value]) => <li key={key}><strong>{key}:</strong> {value}</li>)}
								  
													 
						 
					 
                </ul>
              </div>
            )}

																		  
          </div>
        </div>
      )}
    </div>
  )
}
