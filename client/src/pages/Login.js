import React from "react";
import { message } from "antd";
import { Link, useNavigate } from "react-router-dom";
import axios from "axios";
import { useDispatch } from "react-redux";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { HideLoading, ShowLoading } from "../redux/alertsSlice";
import { Button } from "../components/ui/button";
import { Card, CardContent } from "../components/ui/card";
import { Form, FormItem, FormLabel, FormMessage } from "../components/ui/form";
import '../resourses/auth.css'

const loginSchema = z.object({
  email: z.string().email("Enter a valid email address."),
  password: z.string().min(1, "Password is required."),
});

function Login() {
  const navigate = useNavigate();
  const dispatch = useDispatch();
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm({ defaultValues: { email: "", password: "" } });

  const onFinish = async (values) => {
    const parsed = loginSchema.safeParse(values);
    if (!parsed.success) {
      parsed.error.errors.forEach((error) => {
        setError(error.path[0], { message: error.message });
      });
      return;
    }

    try {
      dispatch(ShowLoading());
      const response = await axios.post("/api/users/login", parsed.data);
      dispatch(HideLoading());
      if (response.data.success) {
        message.success(response.data.message);
        localStorage.setItem("token", response.data.data);
        window.location.href = "/";
      } else {
        message.error(response.data.message);
      }
    } catch (error) {
      dispatch(HideLoading());
      message.error(error.message);
    }
  };

  return (
    <div className="h-screen d-flex justify-content-center align-items-center auth">
      <Card className="w-400 auth-card">
        <CardContent>
        <h1 className="text-lg">OnhighBus - Login</h1>
        <hr />
        <Form onSubmit={handleSubmit(onFinish)}>
          <FormItem>
            <FormLabel>Email</FormLabel>
            <input type="email" {...register("email")} />
            <FormMessage>{errors.email?.message}</FormMessage>
          </FormItem>
          <FormItem>
            <FormLabel>Password</FormLabel>
            <input type="password" {...register("password")} />
            <FormMessage>{errors.password?.message}</FormMessage>
          </FormItem>
          <div className="d-flex justify-content-between align-items-center my-3">
            <Link to="/register">Click Here To Register</Link>
            <Button variant="secondary" type="submit">
              Login
            </Button>
          </div>
        </Form>
        </CardContent>
      </Card>
    </div>
  );
}

export default Login;
