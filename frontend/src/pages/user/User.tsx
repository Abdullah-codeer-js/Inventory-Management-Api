import Single from "../../components/single/Single"
import { singleUser } from "../../data"
import "./user.css"

const User = () => {

  //Fetch data and send to Single Component
  
  return (
    <div className="user">
      <Single {...singleUser}/>
    </div>
  )
}

export default User