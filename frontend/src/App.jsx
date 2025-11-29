import React from 'react'
import RecipeList from './components/RecipeList'
import './App.css'

export default function App() {
  return (
    <div className="container">
      <header className="header">
        <div className="logo">
          <div className="logo-icon">🍳</div>
          <h1>Cookidone</h1>
        </div>
        <p className="tagline">Discover delicious recipes from around the world</p>
      </header>
      <RecipeList />
    </div>
  )
}
